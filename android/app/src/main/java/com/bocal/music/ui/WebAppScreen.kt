package com.bocal.music.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
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
import androidx.webkit.WebViewAssetLoader
import com.bocal.music.BuildConfig

/**
 * The full Bocal web app (tuner, arc nav, notation, seven instruments,
 * transcription, practice tools, the 3D lab), hosted verbatim from the
 * self-contained build in `assets/www/app.html`.
 *
 * That file is the same `preview:standalone` artifact used for on-device web
 * testing: fonts, images and every GLB are already inlined as base64, so
 * serving it needs nothing beyond the asset loader below -- no separate model
 * or texture paths to wire up.
 *
 * Served from `https://appassets.androidplatform.net`, not `file://`. Chromium
 * treats `file://` as an insecure origin, which silently disables
 * getUserMedia -- the tuner's microphone would never open. WebViewAssetLoader
 * serves local assets under a real `https` origin instead, which is the
 * documented way to keep the full web platform surface (mic capture
 * included) available to embedded content.
 *
 * The native Compose screens this replaces (BocalApp.kt and the audio
 * engines under audio/) are left in place rather than deleted: they still
 * compile, and this is a one-file swap in MainActivity to revert.
 */
@Composable
@SuppressLint("SetJavaScriptEnabled") // Required by the bundled app; all non-appassets requests are rejected below.
fun WebAppScreen() {
    val context = LocalContext.current
    var renderGeneration by remember { mutableIntStateOf(0) }
    var pendingMicRequest by remember { mutableStateOf<PermissionRequest?>(null) }
    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val micLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingMicRequest
        pendingMicRequest = null
        if (request == null) return@rememberLauncherForActivityResult
        if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
    }
    // GetContent, not OpenDocument: the upload panel takes one audio file and
    // never asks for persistable access beyond that single read.
    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    val loader = remember {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
    }

    key(renderGeneration) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF060607))
                .semantics { contentDescription = "Bocal" },
            factory = { webContext ->
                WebView(webContext).apply {
                    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
                    setBackgroundColor(android.graphics.Color.rgb(6, 6, 7))
                    settings.javaScriptEnabled = true
                    // Onboarding completion, the chosen instrument, notation
                    // system and Sa tonic all persist through localStorage --
                    // off by default in WebView, unlike a normal browser tab.
                    settings.domStorageEnabled = true
                    // No file:// access anywhere; local content only ever
                    // arrives through the https asset-loader origin below.
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
                        // The tuner and the transcriber's playback both open the
                        // mic or an AudioContext through the same getUserMedia
                        // call the browser build uses; this is the Android side
                        // of that permission prompt.
                        override fun onPermissionRequest(request: PermissionRequest) {
                            if (!request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                                request.deny()
                                return
                            }
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED
                            ) {
                                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                            } else {
                                pendingMicRequest = request
                                micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }

                        // Backs the transcription panel's <input type="file">.
                        override fun onShowFileChooser(
                            view: WebView?,
                            filePathCallback: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?,
                        ): Boolean {
                            pendingFileCallback?.onReceiveValue(null)
                            pendingFileCallback = filePathCallback
                            val mimeType = fileChooserParams?.acceptTypes?.firstOrNull { it.isNotBlank() && it != "*/*" }
                                ?: "audio/*"
                            fileLauncher.launch(mimeType)
                            return true
                        }
                    }

                    loadUrl("https://appassets.androidplatform.net/assets/www/app.html")
                }
            },
            update = {},
            onRelease = { it.destroy() },
        )
    }
}
