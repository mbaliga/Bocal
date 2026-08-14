package com.bocal.music.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class YinPitchDetectorTest {
    private val sampleRate = 48_000
    private val detector = YinPitchDetector(sampleRate)

    @Test
    fun detectsRepresentativeReferencePitches() {
        listOf(220f, 440f, 880f).forEach { frequency ->
            val frame = FloatArray(4_096) { index ->
                (0.5 * sin(2.0 * PI * frequency * index / sampleRate)).toFloat()
            }
            val result = detector.detect(frame)
            assertNotNull("Expected a pitch for $frequency Hz", result)
            assertTrue(abs(result!!.frequencyHz - frequency) < 2f)
            assertTrue(result.confidence > 0.8f)
        }
    }

    @Test
    fun ignoresSilence() {
        assertNull(detector.detect(FloatArray(4_096)))
    }
}
