package com.bocal.music

import android.webkit.WebView
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import org.junit.Rule
import org.junit.Test

class BocalSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun launchShowsLocalFirstTuneSurface() {
        compose.onNodeWithText("Your written note is shown first.").assertIsDisplayed()
        compose.onNodeWithText("Audio is analyzed on this device and is not uploaded.").assertIsDisplayed()
        compose.onNodeWithTag("tuner-toggle").assertIsDisplayed()
        compose.onNodeWithContentDescription("No pitch").assertIsDisplayed()
        compose.onNodeWithContentDescription("Pitch trace has no stable samples").assertIsDisplayed()
    }

    @Test fun navigationKeepsFivePrimaryJobsReachable() {
        listOf(
            "nav-tune" to "Your written note is shown first.",
            "nav-pulse" to "Pulse without clutter",
            "nav-analyze" to "Tone snapshot",
            "nav-practice" to "Practice with evidence",
        ).forEach { (tag, text) ->
            compose.onNodeWithTag(tag).performClick()
            compose.onNodeWithText(text).assertIsDisplayed()
        }
    }

    @Test fun labUsesEmbeddedWebViewBoundary() {
        compose.onNodeWithTag("nav-lab").performClick()
        compose.onNodeWithTag("instrument-lab").assertIsDisplayed()
        onView(isAssignableFrom(WebView::class.java)).check(matches(isDisplayed()))
    }
}
