package com.bocal.music.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.widget.Toast
import java.util.concurrent.Executors

/** Permission-free system Save As on every supported Android version (API 26+).
 * A successful request only means the picker was queued, not that bytes were saved.
 */
class BocalFileSaver(private val activity: Activity) {
    private data class Pending(val name: String, val mime: String, val bytes: ByteArray)
    private val lock = Any()
    private val handler = Handler(Looper.getMainLooper())
    private val writer = Executors.newSingleThreadExecutor()
    private var pending: Pending? = null
    private var busy = false
    private var closed = false

    fun request(name: String, mime: String, encoded: String, launch: (Intent) -> Unit): Boolean {
        if (encoded.length.toLong() > ((MAX_BYTES.toLong() + 2) / 3) * 4) return false
        synchronized(lock) {
            if (closed || busy) return false
            busy = true
        }
        val next = try {
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            require(bytes.size <= MAX_BYTES)
            Pending(sanitizeName(name), sanitizeMime(mime), bytes)
        } catch (_: Exception) {
            synchronized(lock) { busy = false }
            return false
        }
        synchronized(lock) {
            if (closed) { busy = false; return false }
            pending = next
        }
        handler.post {
            if (synchronized(lock) { closed || pending !== next }) return@post
            try {
                launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = next.mime
                    putExtra(Intent.EXTRA_TITLE, next.name)
                })
            } catch (_: Exception) {
                synchronized(lock) { pending = null; busy = false }
                notifyUser("No file-saving app is available. Your recording remains in Bocal.")
            }
        }
        return true
    }

    fun complete(resultCode: Int, uri: Uri?) {
        val next = synchronized(lock) {
            val current = pending
            pending = null
            current
        } ?: return
        if (resultCode != Activity.RESULT_OK || uri == null) {
            synchronized(lock) { busy = false }
            notifyUser("Save cancelled. Your recording remains in Bocal.")
            return
        }
        try {
            writer.execute {
                try {
                    val resolver = activity.contentResolver
                    val stream = resolver.openOutputStream(uri, "wt") ?: error("No output stream")
                    stream.use { it.write(next.bytes); it.flush() }
                    notifyUser("Saved ${next.name}")
                } catch (_: Exception) {
                    // ACTION_CREATE_DOCUMENT may return an existing document URI.
                    // Never delete the destination on failure: it is user-owned,
                    // and a provider does not guarantee atomic writes or rollback.
                    // https://developer.android.com/reference/android/content/Intent#ACTION_CREATE_DOCUMENT
                    notifyUser("Save failed; the destination may be incomplete. Your original recording remains in Bocal. Retry with a new filename.")
                } finally {
                    synchronized(lock) { busy = false }
                }
            }
        } catch (_: Exception) {
            synchronized(lock) { busy = false }
            notifyUser("Save interrupted. Reopen Bocal and retry.")
        }
    }

    fun close() {
        synchronized(lock) { closed = true; pending = null; busy = false }
        writer.shutdown() // Already-started writes finish; queued picker payloads are released.
    }

    private fun notifyUser(message: String) {
        handler.post {
            if (!activity.isFinishing && !activity.isDestroyed) Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
        }
    }

    companion object {
        const val MAX_BYTES = 32 * 1024 * 1024
        fun sanitizeName(name: String): String = name
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
            .trim().trim('.').take(128).ifEmpty { "bocal-download" }
        fun sanitizeMime(mime: String): String = mime.substringBefore(';').trim()
            .takeIf { Regex("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+").matches(it) }
            ?: "application/octet-stream"
    }
}
