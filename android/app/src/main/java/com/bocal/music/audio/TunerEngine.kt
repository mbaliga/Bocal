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
    @Volatile private var running = false
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

        val created = AudioRecord(
            MediaRecorder.AudioSource.UNPROCESSED,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minimum * 2, 8_192),
        )
        if (created.state != AudioRecord.STATE_INITIALIZED) {
            created.release()
            return false
        }

        recorder = created
        running = true
        created.startRecording()
        worker = Thread({ readLoop(created) }, "BocalTuner").also { it.start() }
        return true
    }

    fun stop() {
        running = false
        runCatching { recorder?.stop() }
        worker?.join(250)
        worker = null
        recorder?.release()
        recorder = null
        mainHandler.post { callback(null) }
    }

    private fun readLoop(audioRecord: AudioRecord) {
        val shorts = ShortArray(4_096)
        val floats = FloatArray(4_096)
        while (running) {
            val count = audioRecord.read(shorts, 0, shorts.size, AudioRecord.READ_BLOCKING)
            if (count <= 0) continue
            for (i in floats.indices) {
                floats[i] = if (i < count) shorts[i] / 32768f else 0f
            }
            val result = detector.detect(floats)
            mainHandler.post { if (running) callback(result) }
        }
    }

    override fun close() = stop()
}
