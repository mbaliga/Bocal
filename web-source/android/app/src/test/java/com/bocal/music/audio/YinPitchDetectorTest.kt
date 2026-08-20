package com.bocal.music.audio

import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class YinPitchDetectorTest {
    private val sampleRate = 48_000
    private val detector = YinPitchDetector(sampleRate)

    @Test
    fun `silence never invents a pitch`() {
        assertNull(detector.estimate(FloatArray(2_048)))
    }

    @Test
    fun `clean A4 is detected within five cents`() {
        val samples = FloatArray(2_048) { index ->
            (0.55 * sin(2.0 * PI * 440.0 * index / sampleRate)).toFloat()
        }
        val estimate = requireNotNull(detector.estimate(samples))
        val error = kotlin.math.abs(YinPitchDetector.centsBetween(estimate.frequencyHz, 440.0))
        assertTrue("error was $error cents", error <= 5.0)
        assertTrue(estimate.confidence >= 0.8)
    }

    @Test
    fun `clean tones across the working range remain accurate`() {
        listOf(110.0, 220.0, 440.0, 880.0, 1_320.0).forEach { frequency ->
            val samples = FloatArray(4_096) { index ->
                (0.48 * sin(2.0 * PI * frequency * index / sampleRate)).toFloat()
            }
            val estimate = requireNotNull(detector.estimate(samples, samples.size))
            val error = kotlin.math.abs(YinPitchDetector.centsBetween(estimate.frequencyHz, frequency))
            assertTrue("$frequency Hz error was $error cents", error <= 5.0)
            assertTrue("$frequency Hz confidence was ${estimate.confidence}", estimate.confidence >= 0.8)
        }
    }
}
