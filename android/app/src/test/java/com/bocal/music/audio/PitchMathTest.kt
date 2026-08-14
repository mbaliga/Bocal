package com.bocal.music.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PitchMathTest {
    @Test
    fun concertA4IsCenteredAt440() {
        val reading = PitchMath.from(YinPitchDetector.Result(440f, 0.99f), 440f, 0)!!
        assertEquals("A", reading.writtenNote)
        assertEquals(4, reading.writtenOctave)
        assertEquals("A", reading.concertNote)
        assertEquals(4, reading.concertOctave)
        assertTrue(kotlin.math.abs(reading.cents) < 0.01f)
    }

    @Test
    fun ebInstrumentShowsWrittenAForConcertC() {
        val c4 = PitchMath.frequencyForMidi(60)
        val reading = PitchMath.from(YinPitchDetector.Result(c4, 0.99f), 440f, 9)!!
        assertEquals("C", reading.concertNote)
        assertEquals(4, reading.concertOctave)
        assertEquals("A", reading.writtenNote)
        assertEquals(4, reading.writtenOctave)
    }

    @Test
    fun bbInstrumentShowsWrittenDForConcertC() {
        val c4 = PitchMath.frequencyForMidi(60)
        val reading = PitchMath.from(YinPitchDetector.Result(c4, 0.99f), 440f, 2)!!
        assertEquals("D", reading.writtenNote)
        assertEquals(4, reading.writtenOctave)
    }
}
