package com.bocal.music

import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.doesNotExist
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withContentDescription
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import org.junit.Assume.assumeFalse
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Exercises the native WebView-update gate end to end. Only meaningful on a
 * device/emulator whose installed WebView provider is older than
 * MIN_WEBVIEW_MAJOR (see WebViewFloor.kt) -- CI's API 26 and API 35 images
 * both meet the floor after this fix (Chrome 69 and Chrome 130+
 * respectively), so this test skips itself there via Assume instead of
 * asserting a path nothing on those images exercises. WebViewFloorTest (a
 * plain JVM unit test) covers the version-parsing logic itself on every
 * run, gate active or not; BocalSmokeTest covers the normal-mount path.
 */
@RunWith(AndroidJUnit4::class)
class BocalWebViewGateTest {
    @Test
    fun belowFloorShowsTheUpdateScreenAndNoWebView() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val versionName = WebViewCompat.getCurrentWebViewPackage(context)?.versionName
        assumeFalse(
            "WebView ($versionName) meets MIN_WEBVIEW_MAJOR on this device; the gate path is not exercised here.",
            webViewMeetsFloor(versionName),
        )
        ActivityScenario.launch(MainActivity::class.java).use {
            onView(withContentDescription("Bocal needs a WebView update")).check(matches(isDisplayed()))
            onView(isAssignableFrom(WebView::class.java)).check(doesNotExist())
        }
    }
}
