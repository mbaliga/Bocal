package com.bocal.music

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Plain JVM test for the pure version-floor check -- no emulator needed. */
class WebViewFloorTest {
    @Test
    fun nullVersionFailsTheFloor() {
        assertFalse(webViewMeetsFloor(null))
    }

    @Test
    fun oneMajorBelowTheFloorFails() {
        assertFalse(webViewMeetsFloor("68.0.3440.91"))
    }

    @Test
    fun exactlyAtTheFloorPasses() {
        assertTrue(webViewMeetsFloor("69.0.3497.100"))
    }

    @Test
    fun wellAboveTheFloorPasses() {
        assertTrue(webViewMeetsFloor("130.0.6723.58"))
    }

    @Test
    fun garbageVersionFailsTheFloor() {
        assertFalse(webViewMeetsFloor("not-a-version"))
    }
}
