package com.bocal.music.audio

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sqrt

data class PitchEstimate(
    val frequencyHz: Double,
    val confidence: Double,
    val rms: Double,
)

/**
 * Clean-room YIN-class detector used as a deterministic native foundation.
 * This is deliberately dependency-free. It still requires device and golden-audio validation.
 */
class YinPitchDetector(
    private val sampleRate: Int,
    private val threshold: Double = 0.15,
    private val minimumFrequency: Double = 55.0,
    private val maximumFrequency: Double = 2_200.0,
) {
    fun estimate(samples: FloatArray, count: Int = samples.size): PitchEstimate? {
        if (count < 512) return null
        var energy = 0.0
        for (index in 0 until count) energy += samples[index] * samples[index]
        val rms = sqrt(energy / count)
        if (rms < 0.008) return null

        val minTau = max(2, (sampleRate / maximumFrequency).toInt())
        val maxTau = minOf(count / 2, (sampleRate / minimumFrequency).toInt())
        if (maxTau <= minTau) return null
        val difference = DoubleArray(maxTau + 1)
        val limit = count - maxTau

        for (tau in minTau..maxTau) {
            var sum = 0.0
            for (index in 0 until limit) {
                val delta = samples[index] - samples[index + tau]
                sum += delta * delta
            }
            difference[tau] = sum
        }

        val normalized = DoubleArray(maxTau + 1) { 1.0 }
        var runningSum = 0.0
        for (tau in 1..maxTau) {
            runningSum += difference[tau]
            normalized[tau] = if (runningSum == 0.0) 1.0 else difference[tau] * tau / runningSum
        }

        var tau = -1
        for (candidate in minTau until maxTau) {
            if (normalized[candidate] < threshold) {
                var local = candidate
                while (local + 1 <= maxTau && normalized[local + 1] < normalized[local]) local += 1
                tau = local
                break
            }
        }
        if (tau < 0) return null

        val refinedTau = parabolicTau(normalized, tau)
        if (refinedTau <= 0.0) return null
        val frequency = sampleRate / refinedTau
        val confidence = (1.0 - normalized[tau]).coerceIn(0.0, 1.0)
        if (!frequency.isFinite() || frequency !in minimumFrequency..maximumFrequency) return null
        return PitchEstimate(frequency, confidence, rms)
    }

    private fun parabolicTau(values: DoubleArray, index: Int): Double {
        if (index <= 0 || index >= values.lastIndex) return index.toDouble()
        val left = values[index - 1]
        val center = values[index]
        val right = values[index + 1]
        val denominator = 2.0 * (2.0 * center - right - left)
        return if (abs(denominator) < 1e-12) index.toDouble()
        else index + (right - left) / denominator
    }

    companion object {
        fun centsBetween(actualHz: Double, referenceHz: Double): Double =
            1200.0 * ln(actualHz / referenceHz) / ln(2.0)
    }
}
