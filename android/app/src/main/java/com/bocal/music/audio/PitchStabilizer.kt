package com.bocal.music.audio

import kotlin.math.abs

/**
 * A deliberately small hysteresis layer for live tuning.
 *
 * It does not invent a note: a reading must be confident and repeat across
 * several frames before it becomes stable. A stable reading is held briefly
 * across tiny dropouts, then cleared so silence never leaves a stale note on
 * screen indefinitely.
 */
class PitchStabilizer(
    private val minConfidence: Float = 0.76f,
    private val requiredFrames: Int = 3,
    private val candidateToleranceCents: Float = 38f,
    private val dropoutHoldNanos: Long = 350_000_000L,
) {
    private var candidate: YinPitchDetector.Result? = null
    private var candidateFrames: Int = 0
    private var stable: YinPitchDetector.Result? = null
    private var lastVoicedAtNanos: Long = Long.MIN_VALUE

    fun update(
        reading: YinPitchDetector.Result?,
        nowNanos: Long = System.nanoTime(),
    ): YinPitchDetector.Result? {
        if (reading == null || reading.confidence < minConfidence) {
            candidate = null
            candidateFrames = 0
            if (stable != null && elapsedSinceLastVoiced(nowNanos) > dropoutHoldNanos) {
                stable = null
            }
            return stable
        }

        lastVoicedAtNanos = nowNanos
        val currentCandidate = candidate
        if (
            currentCandidate != null &&
            abs(PitchMath.centsBetween(reading.frequencyHz, currentCandidate.frequencyHz)) <= candidateToleranceCents
        ) {
            candidateFrames += 1
            val blend = 0.35f
            candidate = YinPitchDetector.Result(
                frequencyHz = currentCandidate.frequencyHz * (1f - blend) + reading.frequencyHz * blend,
                confidence = maxOf(currentCandidate.confidence, reading.confidence),
            )
        } else {
            candidate = reading
            candidateFrames = 1
        }

        if (candidateFrames >= requiredFrames) {
            stable = candidate
        }
        return stable
    }

    fun reset() {
        candidate = null
        candidateFrames = 0
        stable = null
        lastVoicedAtNanos = Long.MIN_VALUE
    }

    private fun elapsedSinceLastVoiced(nowNanos: Long): Long =
        if (lastVoicedAtNanos == Long.MIN_VALUE) Long.MAX_VALUE else nowNanos - lastVoicedAtNanos
}
