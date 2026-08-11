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

    @Test fun detectsConcertA() {
        val frame = FloatArray(4_096) { i -> (0.5 * sin(2.0 * PI * 440.0 * i / sampleRate)).toFloat() }
        val result = detector.detect(frame)
        assertNotNull(result)
        assertTrue(abs(result!!.frequencyHz - 440f) < 2f)
        assertTrue(result.confidence > 0.8f)
    }

    @Test fun ignoresSilence() {
        assertNull(detector.detect(FloatArray(4_096)))
    }
}
