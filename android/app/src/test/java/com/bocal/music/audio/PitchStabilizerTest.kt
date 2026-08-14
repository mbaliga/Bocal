package com.bocal.music.audio

import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test

class PitchStabilizerTest {
    @Test
    fun requiresRepeatedConfidentFrames() {
        val stabilizer = PitchStabilizer(requiredFrames = 3)
        val a = YinPitchDetector.Result(440f, 0.95f)
        assertNull(stabilizer.update(a, 0L))
        assertNull(stabilizer.update(a, 10_000_000L))
        assertNotNull(stabilizer.update(a, 20_000_000L))
    }

    @Test
    fun lowConfidenceDoesNotBecomeStable() {
        val stabilizer = PitchStabilizer(requiredFrames = 2)
        val weak = YinPitchDetector.Result(440f, 0.4f)
        assertNull(stabilizer.update(weak, 0L))
        assertNull(stabilizer.update(weak, 10_000_000L))
    }

    @Test
    fun stableReadingExpiresAfterDropoutHold() {
        val stabilizer = PitchStabilizer(requiredFrames = 2, dropoutHoldNanos = 350_000_000L)
        val a = YinPitchDetector.Result(440f, 0.95f)
        stabilizer.update(a, 0L)
        assertNotNull(stabilizer.update(a, 10_000_000L))
        assertNotNull(stabilizer.update(null, 200_000_000L))
        assertNull(stabilizer.update(null, 500_000_000L))
    }
}
