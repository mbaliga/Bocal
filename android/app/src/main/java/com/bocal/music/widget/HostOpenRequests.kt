package com.bocal.music.widget

import java.util.concurrent.atomic.AtomicReference

/**
 * The workspace a widget tap asked [com.bocal.music.MainActivity] to open,
 * held until the page takes it through `bocalHost.takeOpenRequest()`.
 *
 * Pull, not push: on a cold start the page is not listening yet, so the
 * request waits here and the page asks for it once it has mounted; when Bocal
 * is already open, [onRequest] tells the page (with a `bocal:host-open` event)
 * to ask now. Only allow-listed [WidgetDestination]s are ever held.
 */
class HostOpenRequests {
    private val pending = AtomicReference<WidgetDestination?>(null)

    /** Called after a new request is held. Set by the screen that owns the WebView. */
    @Volatile
    var onRequest: (() -> Unit)? = null

    /** Holds the destination named by [raw]; false (and nothing held) for anything off the list. */
    fun offer(raw: String?): Boolean {
        val destination = WidgetDestination.parse(raw) ?: return false
        pending.set(destination)
        onRequest?.invoke()
        return true
    }

    /** The held destination's id, once; "" when there is none. */
    fun take(): String = pending.getAndSet(null)?.id ?: ""

    companion object {
        /** The extra a widget's open intent carries: a [WidgetDestination.id]. */
        const val EXTRA_OPEN = "com.bocal.music.extra.OPEN"
    }
}
