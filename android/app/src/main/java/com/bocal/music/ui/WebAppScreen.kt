package com.bocal.music.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.net.Uri
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.WebViewAssetLoader
import com.bocal.music.BuildConfig

/** Shared standalone bundle, local HTTPS origin, no network fallback. */
@Composable
@SuppressLint("SetJavaScriptEnabled")
fun WebAppScreen() {
    val context = LocalContext.current
    val activity = context as Activity
    val lifecycleOwner = LocalLifecycleOwner.current
    var renderGeneration by remember { mutableIntStateOf(0) }
    var pendingMicRequest by remember { mutableStateOf<PermissionRequest?>(null) }
    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    val fileSaver = remember(activity) { BocalFileSaver(activity) }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        fileSaver.complete(it.resultCode, it.data?.data)
    }
    DisposableEffect(fileSaver) { onDispose { fileSaver.close() } }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    webViewRef?.let { webView ->
                        webView.evaluateJavascript("window.dispatchEvent(new Event('bocal:host-pause'))", null)
                        webView.onPause()
                    }
                }
                Lifecycle.Event.ON_RESUME -> webViewRef?.onResume()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val micLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingMicRequest
        pendingMicRequest = null
        if (request != null) {
            if (granted && webViewRef != null && isBocalOrigin(request.origin)) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            else request.deny()
        }
    }
    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }
    BackHandler {
        val webView = webViewRef
        if (webView == null) {
            activity.finish()
        } else {
            webView.evaluateJavascript(
                """
                (() => {
                  const hadOverlay = Boolean(document.querySelector('.experience-overlay, .onboarding-overlay, .download-overlay'));
                  if (hadOverlay) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                  return hadOverlay;
                })()
                """.trimIndent(),
            ) { handled ->
                if (handled != "true") activity.runOnUiThread { activity.finish() }
            }
        }
    }
    val loader = remember {
        WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context)).build()
    }
    key(renderGeneration) {
        AndroidView(
            modifier = Modifier.fillMaxSize().background(Color(0xFF060607))
                .windowInsetsPadding(WindowInsets.systemBars).semantics { contentDescription = "Bocal" },
            factory = { webContext ->
                WebView(webContext).apply {
                    webViewRef = this
                    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
                    setBackgroundColor(android.graphics.Color.rgb(6, 6, 7))
                    settings.javaScriptEnabled = true
                    addJavascriptInterface(BocalHost(activity, this) { name, mime, bytes ->
                        fileSaver.request(name, mime, bytes) { intent -> saveLauncher.launch(intent) }
                    }, "bocalHost")
                    setDownloadListener { _, _, _, _, _ ->
                        android.widget.Toast.makeText(context, "Use the recording's Export button to save this file.", android.widget.Toast.LENGTH_LONG).show()
                    }
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    @Suppress("DEPRECATION")
                    run {
                        settings.allowFileAccessFromFileURLs = false
                        settings.allowUniversalAccessFromFileURLs = false
                    }
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.mediaPlaybackRequiresUserGesture = true
                    webViewClient = LocalAssetWebViewClient(loader) { renderGeneration += 1 }
                    webChromeClient = object : WebChromeClient() {
                        override fun onPermissionRequest(request: PermissionRequest) {
                            if (!isBocalOrigin(request.origin) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) || pendingMicRequest != null) {
                                request.deny()
                                return
                            }
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                            } else {
                                pendingMicRequest = request
                                micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                        override fun onPermissionRequestCanceled(request: PermissionRequest) {
                            if (pendingMicRequest === request) pendingMicRequest = null
                        }
                        override fun onShowFileChooser(view: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                            pendingFileCallback?.onReceiveValue(null)
                            pendingFileCallback = filePathCallback
                            val mimeType = fileChooserParams?.acceptTypes?.firstOrNull { it.isNotBlank() && it != "*/*" } ?: "audio/*"
                            try { fileLauncher.launch(mimeType) }
                            catch (_: Exception) { pendingFileCallback?.onReceiveValue(null); pendingFileCallback = null }
                            return true
                        }
                    }
                    loadUrl("https://appassets.androidplatform.net/assets/www/app.html")
                }
            },
            update = {},
            onRelease = {
                if (webViewRef === it) webViewRef = null
                pendingMicRequest?.deny()
                pendingMicRequest = null
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = null
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                it.removeJavascriptInterface("bocalHost")
                it.stopLoading()
                it.destroy()
            },
        )
    }
}

internal fun isBocalOrigin(uri: Uri): Boolean = uri.scheme == "https" &&
    uri.host == "appassets.androidplatform.net" && (uri.port == -1 || uri.port == 443) && uri.userInfo == null
