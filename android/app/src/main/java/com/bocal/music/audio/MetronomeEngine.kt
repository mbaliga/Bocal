package com.bocal.music.audio

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper

class MetronomeEngine(private val onBeat: (Int) -> Unit) : AutoCloseable {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 72)
    @Volatile private var running = false
    private var worker: Thread? = null

    val isRunning: Boolean get() = running

    fun start(bpm: Int, beatsPerBar: Int, subdivisions: Int = 1) {
        stop()
        running = true
        worker = Thread({
            val intervalNanos = (60_000_000_000.0 / bpm.coerceIn(30, 260) / subdivisions.coerceIn(1, 4)).toLong()
            var tick = 0
            var target = System.nanoTime()
            while (running) {
                val beat = (tick / subdivisions) % beatsPerBar.coerceIn(1, 12)
                val subdivision = tick % subdivisions
                val toneType = if (beat == 0 && subdivision == 0) ToneGenerator.TONE_PROP_BEEP2 else ToneGenerator.TONE_PROP_BEEP
                tone.startTone(toneType, if (subdivision == 0) 45 else 24)
                if (subdivision == 0) mainHandler.post { if (running) onBeat(beat) }
                tick += 1
                target += intervalNanos
                val remaining = target - System.nanoTime()
                if (remaining > 0) {
                    Thread.sleep(remaining / 1_000_000, (remaining % 1_000_000).toInt())
                }
            }
        }, "BocalMetronome").also { it.start() }
    }

    fun stop() {
        running = false
        worker?.interrupt()
        worker?.join(100)
        worker = null
        tone.stopTone()
    }

    override fun close() {
        stop()
        tone.release()
    }
}
