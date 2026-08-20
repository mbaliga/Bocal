package com.bocal.music.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.Process
import kotlin.concurrent.thread
import kotlin.math.floor
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt

data class TunerReading(
    val state: State,
    val frequencyHz: Double? = null,
    val writtenNote: String = "—",
    val writtenOctave: Int? = null,
    val concertNote: String = "—",
    val concertOctave: Int? = null,
    val cents: Int? = null,
    val confidence: Double = 0.0,
    val message: String = "Ready",
) {
    enum class State { READY, LISTENING, LOCKED, SILENCE, ERROR }
}

class TunerEngine(
    context: Context,
    private val sampleRate: Int = 48_000,
    private val frameSize: Int = 2_048,
) {
    private val detector = YinPitchDetector(sampleRate)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        .setOnAudioFocusChangeListener { change ->
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                stopInternal(abandonFocus = false)
                publish(TunerReading(TunerReading.State.ERROR, message = "Listening paused by another audio app."))
            }
        }
        .build()
    @Volatile private var running = false
    private var audioRecord: AudioRecord? = null
    var onReading: (TunerReading) -> Unit = {}

    @SuppressLint("MissingPermission")
    fun start(writtenOffset: Int): Boolean {
        if (running) return true
        if (audioManager.requestAudioFocus(focusRequest) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            publish(TunerReading(TunerReading.State.ERROR, message = "Another audio app is using the device."))
            return false
        }
        val minimum = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_FLOAT,
        )
        if (minimum <= 0) {
            audioManager.abandonAudioFocusRequest(focusRequest)
            publish(TunerReading(TunerReading.State.ERROR, message = "This device did not expose a usable microphone buffer."))
            return false
        }
        val recorder = buildRecorder(MediaRecorder.AudioSource.UNPROCESSED, minimum)
            ?: buildRecorder(MediaRecorder.AudioSource.VOICE_RECOGNITION, minimum)
        if (recorder == null) {
            audioManager.abandonAudioFocusRequest(focusRequest)
            publish(TunerReading(TunerReading.State.ERROR, message = "Microphone initialization failed."))
            return false
        }

        audioRecord = recorder
        running = true
        try {
            recorder.startRecording()
        } catch (_: IllegalStateException) {
            stopInternal()
            publish(TunerReading(TunerReading.State.ERROR, message = "Android could not start microphone capture."))
            return false
        }
        publish(TunerReading(TunerReading.State.LISTENING, message = "Listening"))
        thread(name = "BocalTuner", isDaemon = true) {
            Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
            val frame = FloatArray(frameSize)
            while (running) {
                val read = recorder.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                if (read <= 0) {
                    val interrupted = running
                    stopInternal()
                    if (interrupted) publish(TunerReading(TunerReading.State.ERROR, message = "Microphone capture was interrupted."))
                    break
                }
                val estimate = detector.estimate(frame, read)
                if (estimate == null || estimate.confidence < 0.72) {
                    publish(TunerReading(TunerReading.State.SILENCE, message = "Play one steady note"))
                } else {
                    publish(toReading(estimate, writtenOffset))
                }
            }
        }
        return true
    }

    fun stop() {
        stopInternal()
        publish(TunerReading(TunerReading.State.READY))
    }

    fun release() {
        stopInternal()
    }

    @SuppressLint("MissingPermission")
    private fun buildRecorder(source: Int, minimum: Int): AudioRecord? = runCatching {
        AudioRecord.Builder()
            .setAudioSource(source)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                    .build(),
            )
            .setBufferSizeInBytes(maxOf(minimum, frameSize * 8))
            .build()
    }.getOrNull()?.let { recorder ->
        if (recorder.state == AudioRecord.STATE_INITIALIZED) recorder else {
            recorder.release()
            null
        }
    }

    private fun stopInternal(abandonFocus: Boolean = true) {
        running = false
        audioRecord?.runCatching { stop() }
        audioRecord?.release()
        audioRecord = null
        if (abandonFocus) audioManager.abandonAudioFocusRequest(focusRequest)
    }

    private fun toReading(estimate: PitchEstimate, writtenOffset: Int): TunerReading {
        val midiFloat = 69.0 + 12.0 * log2(estimate.frequencyHz / 440.0)
        val concertMidi = midiFloat.roundToInt()
        val writtenMidi = concertMidi + writtenOffset
        val reference = 440.0 * 2.0.pow((concertMidi - 69) / 12.0)
        val cents = YinPitchDetector.centsBetween(estimate.frequencyHz, reference).roundToInt()
        val written = noteFor(writtenMidi)
        val concert = noteFor(concertMidi)
        return TunerReading(
            state = TunerReading.State.LOCKED,
            frequencyHz = estimate.frequencyHz,
            writtenNote = written.first,
            writtenOctave = written.second,
            concertNote = concert.first,
            concertOctave = concert.second,
            cents = cents,
            confidence = estimate.confidence,
            message = when {
                cents > 5 -> "Sharp"
                cents < -5 -> "Flat"
                else -> "Centered"
            },
        )
    }

    private fun noteFor(midi: Int): Pair<String, Int> {
        val names = arrayOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")
        val pitchClass = ((midi % 12) + 12) % 12
        return names[pitchClass] to floor(midi / 12.0).toInt() - 1
    }

    private fun publish(reading: TunerReading) {
        mainHandler.post { onReading(reading) }
    }
}
