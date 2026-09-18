package com.bocal.music

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertSame
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Verifies live JS, not just localStorage, survives a real configuration resize. */
@RunWith(AndroidJUnit4::class)
class BocalRotationSmokeTest {
    @Test
    fun rotationRetainsTheActivityWebViewAndLiveJavascriptState() {
        // This test is meaningless without a live WebView to rotate (see
        // WebViewFloor.kt); both CI emulator images meet the floor after
        // this fix. BocalWebViewGateTest covers the below-floor path.
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val versionName = WebViewCompat.getCurrentWebViewPackage(context)?.versionName
        assumeTrue("WebView ($versionName) is below MIN_WEBVIEW_MAJOR; the app shows the update screen instead.", webViewMeetsFloor(versionName))
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            awaitCondition("Initial portrait layout did not settle") {
                var portrait = false
                scenario.onActivity { portrait = it.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT }
                portrait
            }
            awaitCondition("Bocal did not mount") {
                evaluate(scenario, "Boolean(document.querySelector('.app-shell'))") == "true"
            }
            val originalActivity = AtomicReference<MainActivity>()
            val originalWebView = AtomicReference<WebView>()
            scenario.onActivity {
                originalActivity.set(it)
                originalWebView.set(findWebView(it.window.decorView))
            }
            // A dropped callback here must not leave the sentinel unset and let
            // the checks below pass vacuously, so retry the assignment itself
            // until it is confirmed to have run once.
            awaitCondition("Could not set the rotation sentinel") {
                evaluate(scenario, "window.__bocalRotationSentinel = 'live-state'; true") == "true"
            }
            for (orientation in arrayOf(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE, ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)) {
                scenario.onActivity { it.requestedOrientation = orientation }
                val expected = if (orientation == ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE) Configuration.ORIENTATION_LANDSCAPE else Configuration.ORIENTATION_PORTRAIT
                awaitCondition("Requested orientation was not applied") {
                    var matches = false
                    scenario.onActivity { matches = it.resources.configuration.orientation == expected }
                    matches
                }
                scenario.onActivity {
                    assertSame("Rotation must not recreate the Activity", originalActivity.get(), it)
                    assertSame("Rotation must retain the live WebView", originalWebView.get(), findWebView(it.window.decorView))
                }
                awaitCondition("Rotation sentinel was lost") {
                    evaluate(scenario, "window.__bocalRotationSentinel === 'live-state'") == "true"
                }
                awaitCondition("Bocal did not remain mounted after rotation") {
                    evaluate(scenario, "Boolean(document.querySelector('.app-shell'))") == "true"
                }
            }
        }
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) {
            findWebView(view.getChildAt(index))?.let { return it }
        }
        return null
    }

    /**
     * evaluateJavascript callbacks can be dropped while Chromium is still
     * attaching the first renderer after a cold emulator boot. Treat one
     * missing callback as a transient readiness signal, not an immediate test
     * failure: return null and let the caller's poll (awaitCondition) retry
     * until its overall deadline. Once the page is ready, every assertion
     * still has to return true.
     */
    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String? {
        val complete = CountDownLatch(1)
        val value = AtomicReference<String?>()
        scenario.onActivity { activity ->
            val webView = findWebView(activity.window.decorView)
            if (webView == null) complete.countDown()
            else webView.evaluateJavascript(script) { result -> value.set(result); complete.countDown() }
        }
        if (!complete.await(5, TimeUnit.SECONDS)) return null
        return value.get()
    }

    private fun awaitCondition(message: String, condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
        do {
            if (condition()) return
            Thread.sleep(100)
        } while (System.nanoTime() < deadline)
        throw AssertionError(message)
    }
}
