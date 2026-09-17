package com.bocal.music.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat

/** Bridge calls arrive on a WebView background thread. UI work is posted to main. */
class BocalHost(
    private val activity: Activity,
    private val rootView: View,
    private val requestFileSave: (String, String, String) -> Boolean,
) {
    @JavascriptInterface
    fun setTheme(theme: String) {
        activity.runOnUiThread {
            if (activity.isDestroyed) return@runOnUiThread
            val isLight = theme == "light"
            val background = if (isLight) LIGHT_BACKGROUND else DARK_BACKGROUND
            activity.window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(background))
            rootView.setBackgroundColor(background)
            val controller = WindowCompat.getInsetsController(activity.window, rootView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
        }
    }

    @JavascriptInterface
    fun setKeepAwake(on: Boolean) {
        activity.runOnUiThread {
            if (activity.isDestroyed) return@runOnUiThread
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /** True means the Save As request was accepted. Native UI reports the final result. */
    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String): Boolean = requestFileSave(name, mime, base64)

    @JavascriptInterface
    fun openExternal(url: String): Boolean {
        val uri = Uri.parse(url)
        if ((uri.scheme != "http" && uri.scheme != "https") || uri.host.isNullOrBlank() || uri.userInfo != null) return false
        activity.runOnUiThread {
            if (activity.isDestroyed) return@runOnUiThread
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {
                android.widget.Toast.makeText(activity, "No browser is available to open this link.", android.widget.Toast.LENGTH_LONG).show()
            }
        }
        return true
    }

    private companion object {
        const val LIGHT_BACKGROUND = 0xFFF7F5EE.toInt()
        const val DARK_BACKGROUND = 0xFF060607.toInt()
    }
}
