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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
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
            assertEquals("true", evaluate(scenario, "window.__bocalRotationSentinel = 'live-state'; true"))
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
                assertEquals("true", evaluate(scenario, "window.__bocalRotationSentinel === 'live-state'"))
                assertEquals("true", evaluate(scenario, "Boolean(document.querySelector('.app-shell'))"))
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

    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String? {
        val complete = CountDownLatch(1)
        val value = AtomicReference<String?>()
        scenario.onActivity { activity ->
            val webView = findWebView(activity.window.decorView)
            if (webView == null) complete.countDown()
            else webView.evaluateJavascript(script) { result -> value.set(result); complete.countDown() }
        }
        assertTrue("JavaScript callback timed out", complete.await(5, TimeUnit.SECONDS))
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
