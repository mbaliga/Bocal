package com.bocal.music

import android.webkit.WebView
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.doesNotExist
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withContentDescription
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * The app is now a single WebView host: Compose semantics (tags, content
 * descriptions) cannot see into the page DOM, so this asserts the WebView is
 * displayed and has actually navigated to the bundled app rather than a
 * blank or error page -- unless this device's WebView is older than
 * MIN_WEBVIEW_MAJOR, in which case the app never creates a WebView at all
 * and shows the native update screen instead (see WebViewFloor.kt). Both
 * CI emulator images (API 26, API 35) meet the floor after this fix, so
 * this exercises the normal-mount path there; a device below the floor
 * still gets a meaningful assertion instead of an unexplained failure.
 */
class BocalSmokeTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun webViewIsDisplayedAndLoadsTheBundledApp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val meetsFloor = webViewMeetsFloor(WebViewCompat.getCurrentWebViewPackage(context)?.versionName)
        if (!meetsFloor) {
            onView(withContentDescription("Bocal needs a WebView update")).check(matches(isDisplayed()))
            onView(isAssignableFrom(WebView::class.java)).check(doesNotExist())
            return
        }
        onView(isAssignableFrom(WebView::class.java)).check(matches(isDisplayed()))

        var title: String? = null
        val latch = java.util.concurrent.CountDownLatch(1)
        var webView: WebView? = null
        activityRule.scenario.onActivity {
            webView = findWebView(it.window.decorView)
        }
        // document.title is empty until the page finishes loading; poll
        // briefly rather than assuming a fixed delay is enough on CI hardware.
        repeat(50) {
            val view = webView ?: return@repeat
            var result: String? = null
            val inner = java.util.concurrent.CountDownLatch(1)
            activityRule.scenario.onActivity {
                view.evaluateJavascript("document.title") { value -> result = value; inner.countDown() }
            }
            inner.await(200, java.util.concurrent.TimeUnit.MILLISECONDS)
            if (!result.isNullOrBlank() && result != "\"\"") {
                title = result
                latch.countDown()
                return@repeat
            }
            Thread.sleep(100)
        }
        latch.await(1, java.util.concurrent.TimeUnit.SECONDS)
        assertTrue("expected the bundled app to report a document title, got: $title", !title.isNullOrBlank())
    }

    private fun findWebView(view: android.view.View): WebView? {
        if (view is WebView) return view
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                findWebView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }
}
