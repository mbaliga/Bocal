package com.bocal.music

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BocalDeviceInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun bundledBronzeSaxophoneAssetIsPresent() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val bytes = context.assets.open("models/saxophone-alto.glb").use { it.readBytes().size }
        assertTrue("The bundled alto saxophone model is unexpectedly small", bytes > 1_000_000)
    }

    @Test
    fun onboardingLabAndLandscapeNavigationSurviveRotation() {
        val skipGuide = composeRule.onAllNodesWithText("Skip guide")
        if (skipGuide.fetchSemanticsNodes().isNotEmpty()) skipGuide[0].performClick()
        composeRule.onNodeWithContentDescription("3D lab").performClick()
        composeRule.onNodeWithText("3D LAB").fetchSemanticsNode()

        composeRule.activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        composeRule.waitUntil(8_000) {
            composeRule.activity.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        }
        composeRule.onNodeWithContentDescription("3D lab").fetchSemanticsNode()
        composeRule.onNodeWithText("3D LAB").fetchSemanticsNode()

        composeRule.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
        composeRule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        composeRule.onNodeWithContentDescription("3D lab").fetchSemanticsNode()
    }
}
