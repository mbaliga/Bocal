package com.bocal.music.audio

import kotlin.math.floor
import kotlin.math.log2
import kotlin.math.roundToInt

data class PitchReading(
    val frequencyHz: Float,
    val confidence: Float,
    val writtenNote: String,
    val writtenOctave: Int,
    val concertNote: String,
    val concertOctave: Int,
    val cents: Float,
    val concertMidi: Int,
    val writtenMidi: Int,
)

/**
 * Pure pitch/display math kept outside Compose so transposition and cents
 * behavior can be unit-tested on the JVM.
 */
object PitchMath {
    val noteNames: List<String> = listOf(
        "C", "C\u266f", "D", "E\u266d", "E", "F",
        "F\u266f", "G", "A\u266d", "A", "B\u266d", "B",
    )

    fun from(
        result: YinPitchDetector.Result?,
        a4Hz: Float,
        writtenTransposeSemitones: Int,
    ): PitchReading? {
        result ?: return null
        if (!result.frequencyHz.isFinite() || result.frequencyHz <= 0f) return null
        if (!a4Hz.isFinite() || a4Hz <= 0f) return null

        val concertFloat = 69f + 12f * log2(result.frequencyHz / a4Hz)
        val concertMidi = concertFloat.roundToInt()
        val writtenMidi = concertMidi + writtenTransposeSemitones
        val targetHz = a4Hz * Math.pow(2.0, (concertMidi - 69) / 12.0).toFloat()
        val cents = 1_200f * log2(result.frequencyHz / targetHz)

        return PitchReading(
            frequencyHz = result.frequencyHz,
            confidence = result.confidence.coerceIn(0f, 1f),
            writtenNote = noteName(writtenMidi),
            writtenOctave = octave(writtenMidi),
            concertNote = noteName(concertMidi),
            concertOctave = octave(concertMidi),
            cents = cents,
            concertMidi = concertMidi,
            writtenMidi = writtenMidi,
        )
    }

    fun noteName(midi: Int): String = noteNames[((midi % 12) + 12) % 12]

    fun octave(midi: Int): Int = floor(midi / 12f).toInt() - 1

    fun frequencyForMidi(midi: Int, a4Hz: Float = 440f): Float =
        a4Hz * Math.pow(2.0, (midi - 69) / 12.0).toFloat()

    fun centsBetween(aHz: Float, bHz: Float): Float {
        if (aHz <= 0f || bHz <= 0f) return Float.POSITIVE_INFINITY
        return 1_200f * log2(aHz / bHz)
    }
}
