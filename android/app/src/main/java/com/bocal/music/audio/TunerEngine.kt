package com.bocal.music.audio

import android.Manifest
import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresPermission
import kotlin.math.max

class TunerEngine(
    private val sampleRate: Int = 48_000,
    private val callback: (YinPitchDetector.Result?) -> Unit,
) : AutoCloseable {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val detector = YinPitchDetector(sampleRate)

    @Volatile
    private var running = false
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null

    val isRunning: Boolean get() = running

    @SuppressLint("MissingPermission")
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun start(): Boolean {
        if (running) return true

        val minimum = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minimum <= 0) return false

        val created = createRecorder(minimum) ?: return false
        val started = runCatching {
            created.startRecording()
            created.recordingState == AudioRecord.RECORDSTATE_RECORDING
        }.getOrDefault(false)

        if (!started) {
            created.release()
            return false
        }

        recorder = created
        running = true
        worker = Thread({ readLoop(created) }, "BocalTuner").also { it.start() }
        return true
    }

    fun stop() {
        running = false
        val activeRecorder = recorder
        runCatching { activeRecorder?.stop() }
        worker?.let { activeWorker ->
            if (activeWorker !== Thread.currentThread()) {
                runCatching { activeWorker.join(350) }
            }
        }
        worker = null
        runCatching { activeRecorder?.release() }
        recorder = null
        mainHandler.post { callback(null) }
    }

    @SuppressLint("MissingPermission")
    private fun createRecorder(minimumBufferBytes: Int): AudioRecord? {
        val bufferBytes = max(minimumBufferBytes * 2, 8_192)
        val sources = intArrayOf(
            MediaRecorder.AudioSource.UNPROCESSED,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.DEFAULT,
        )

        for (source in sources) {
            val candidate = runCatching {
                AudioRecord(
                    source,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferBytes,
                )
            }.getOrNull() ?: continue

            if (candidate.state == AudioRecord.STATE_INITIALIZED) return candidate
            candidate.release()
        }
        return null
    }

    private fun readLoop(audioRecord: AudioRecord) {
        val frameSize = 4_096
        val shorts = ShortArray(frameSize)
        val floats = FloatArray(frameSize)

        var routeFailed = false
        while (running) {
            val count = audioRecord.read(shorts, 0, shorts.size, AudioRecord.READ_BLOCKING)
            if (!running) break
            if (count == AudioRecord.ERROR_DEAD_OBJECT || count == AudioRecord.ERROR_INVALID_OPERATION) {
                routeFailed = true
                break
            }
            if (count <= 0) continue

            for (index in floats.indices) {
                floats[index] = if (index < count) shorts[index] / 32768f else 0f
            }

            val result = detector.detect(floats)
            mainHandler.post {
                if (running) callback(result)
            }
        }
        if (routeFailed && running) {
            running = false
            mainHandler.post { callback(null) }
        }
    }

    override fun close() = stop()
}
