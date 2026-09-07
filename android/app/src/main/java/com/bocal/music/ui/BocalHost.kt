package com.bocal.music.ui

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat
import java.io.OutputStream

/**
 * The native side of `window.bocalHost`, documented in the shared native
 * bridge contract: `setTheme`, `setKeepAwake`, `saveFile`, `openExternal`.
 * All calls arrive on a WebView background thread, so anything touching the
 * window or the view hierarchy is posted back to the main/UI thread.
 */
class BocalHost(private val activity: Activity, private val rootView: View) {

    @JavascriptInterface
    fun setTheme(theme: String) {
        val isLight = theme == "light"
        activity.runOnUiThread {
            val window = activity.window
            val background = if (isLight) LIGHT_BACKGROUND else DARK_BACKGROUND
            window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(background))
            rootView.setBackgroundColor(background)
            val controller = WindowCompat.getInsetsController(window, rootView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
        }
    }

    @JavascriptInterface
    fun setKeepAwake(on: Boolean) {
        activity.runOnUiThread {
            if (on) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    /**
     * Writes a base64 payload into MediaStore Downloads. Runs on the calling
     * (WebView) thread deliberately -- `saveFile` returns a boolean the page
     * relies on synchronously, and MediaStore access here is quick and does
     * not touch the UI.
     */
    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String): Boolean {
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, sanitizeName(name))
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/Bocal")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }
            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Downloads.EXTERNAL_CONTENT_URI
            } else {
                @Suppress("DEPRECATION")
                MediaStore.Files.getContentUri("external")
            }
            val uri: Uri = resolver.insert(collection, values) ?: return false
            val stream: OutputStream = resolver.openOutputStream(uri) ?: return false
            stream.use { it.write(bytes) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }
            true
        } catch (error: Exception) {
            Log.w("BocalHost", "saveFile failed", error)
            false
        }
    }

    @JavascriptInterface
    fun openExternal(url: String): Boolean {
        return try {
            val uri = Uri.parse(url)
            if (uri.scheme != "http" && uri.scheme != "https") return false
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (error: Exception) {
            Log.w("BocalHost", "openExternal failed for $url", error)
            false
        }
    }

    private fun sanitizeName(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        return cleaned.ifEmpty { "bocal-download" }
    }

    private companion object {
        const val LIGHT_BACKGROUND = 0xFFF7F5EE.toInt()
        const val DARK_BACKGROUND = 0xFF060607.toInt()
    }
}
