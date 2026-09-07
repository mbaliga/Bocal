package com.bocal.music

import android.webkit.WebView
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.ext.junit.rules.ActivityScenarioRule
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * The app is now a single WebView host: Compose semantics (tags, content
 * descriptions) cannot see into the page DOM, so this asserts the WebView is
 * displayed and has actually navigated to the bundled app rather than a
 * blank or error page.
 */
class BocalSmokeTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun webViewIsDisplayedAndLoadsTheBundledApp() {
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
