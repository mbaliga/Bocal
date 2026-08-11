package com.bocal.music.audio

import kotlin.math.max
import kotlin.math.min

/**
 * Clean-room implementation of the difference and cumulative-mean-normalized
 * difference stages described in the YIN paper. No third-party DSP code is used.
 */
class YinPitchDetector(
    private val sampleRate: Int,
    private val threshold: Float = 0.14f,
    private val minFrequency: Float = 45f,
    private val maxFrequency: Float = 2_200f,
) {
    data class Result(val frequencyHz: Float, val confidence: Float)

    fun detect(samples: FloatArray): Result? {
        if (samples.size < 512 || rootMeanSquare(samples) < 0.009f) return null

        val half = samples.size / 2
        val minTau = max(2, (sampleRate / maxFrequency).toInt())
        val maxTau = min(half - 1, (sampleRate / minFrequency).toInt())
        if (maxTau <= minTau) return null

        val difference = FloatArray(maxTau + 1)
        for (tau in minTau..maxTau) {
            var sum = 0f
            for (i in 0 until half) {
                val delta = samples[i] - samples[i + tau]
                sum += delta * delta
            }
            difference[tau] = sum
        }

        val cmnd = FloatArray(maxTau + 1) { 1f }
        var running = 0f
        for (tau in 1..maxTau) {
            running += difference[tau]
            cmnd[tau] = if (running > 0f) difference[tau] * tau / running else 1f
        }

        var selected = -1
        for (tau in minTau until maxTau) {
            if (cmnd[tau] < threshold && cmnd[tau] <= cmnd[tau + 1]) {
                selected = tau
                break
            }
        }

        if (selected < 0) {
            var bestValue = 1f
            for (tau in minTau..maxTau) {
                if (cmnd[tau] < bestValue) {
                    bestValue = cmnd[tau]
                    selected = tau
                }
            }
            if (selected < 0 || bestValue > 0.28f) return null
        }

        val left = cmnd[max(minTau, selected - 1)]
        val middle = cmnd[selected]
        val right = cmnd[min(maxTau, selected + 1)]
        val denominator = 2f * (2f * middle - left - right)
        val refinedTau = if (denominator != 0f) {
            selected + (right - left) / denominator
        } else {
            selected.toFloat()
        }
        if (!refinedTau.isFinite() || refinedTau <= 0f) return null

        return Result(
            frequencyHz = sampleRate / refinedTau,
            confidence = (1f - middle).coerceIn(0f, 1f),
        )
    }

    private fun rootMeanSquare(samples: FloatArray): Float {
        var sum = 0.0
        for (sample in samples) sum += sample * sample
        return kotlin.math.sqrt(sum / samples.size).toFloat()
    }
}
