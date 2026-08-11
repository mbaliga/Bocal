package com.bocal.music.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

class ReferenceToneEngine : AutoCloseable {
    private var track: AudioTrack? = null

    fun play(frequencyHz: Float, waveform: Waveform = Waveform.SINE) {
        stop()
        val sampleRate = 48_000
        val frameCount = sampleRate * 2
        val samples = ShortArray(frameCount)
        for (i in samples.indices) {
            val phase = 2.0 * PI * frequencyHz * i / sampleRate
            val value = when (waveform) {
                Waveform.SINE -> sin(phase)
                Waveform.TRIANGLE -> 2.0 / PI * kotlin.math.asin(sin(phase))
                Waveform.SQUARE -> if (sin(phase) >= 0) 0.65 else -0.65
            }
            val envelope = (i / 720f).coerceAtMost(1f)
            samples[i] = (value * envelope * 8_000).toInt().toShort()
        }

        val created = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(samples.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        created.write(samples, 0, samples.size)
        created.setLoopPoints(0, samples.size, -1)
        created.play()
        track = created
    }

    fun stop() {
        track?.let { runCatching { it.stop() }; it.release() }
        track = null
    }

    override fun close() = stop()

    enum class Waveform { SINE, TRIANGLE, SQUARE }
}
