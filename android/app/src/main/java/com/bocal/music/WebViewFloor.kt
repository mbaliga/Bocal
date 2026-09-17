package com.bocal.music

/**
 * The lowest Android System WebView major version Bocal will load the app
 * bundle into. Below this, [com.bocal.music.ui.WebAppScreen] never creates
 * a `WebView` -- it shows [com.bocal.music.ui.WebViewUpdateScreen] instead.
 *
 * This must stay in lockstep with the standalone web bundle's build
 * target: `web-source/vite.preview.config.ts` sets `build.target:
 * ["chrome69"]`, so esbuild lowers modern syntax (optional chaining,
 * nullish coalescing, class fields, ...) only down to what Chrome 69 can
 * parse. A WebView older than that throws `Uncaught SyntaxError:
 * Unexpected token ?` on the very first script tag instead of rendering
 * anything -- which is exactly what CI's API 26 "google_apis" emulator
 * image (Chrome 69) demonstrated before both halves of this fix landed.
 * If that build target ever moves, move this in the same change.
 */
const val MIN_WEBVIEW_MAJOR = 69

/**
 * True when [versionName] -- as reported by
 * `WebViewCompat.getCurrentWebViewPackage(context)?.versionName`, e.g.
 * `"130.0.6723.58"` -- is at least [MIN_WEBVIEW_MAJOR]. A null, blank or
 * unparsable version (no WebView provider installed, or a device that
 * reports something unexpected) is treated as failing the floor: we
 * cannot confirm the bundle will parse, so we do not risk loading it.
 *
 * Pure and framework-free on purpose -- it has a plain JVM unit test
 * (android/app/src/test/java/com/bocal/music/WebViewFloorTest.kt) rather
 * than needing an emulator.
 */
fun webViewMeetsFloor(versionName: String?): Boolean {
    val major = versionName?.trim()?.substringBefore('.')?.toIntOrNull() ?: return false
    return major >= MIN_WEBVIEW_MAJOR
}
