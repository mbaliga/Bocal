package com.bocal.music.ui

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bocal.music.audio.TunerReading

@Composable
fun AnalysisScreen(reading: TunerReading, pitchTrace: List<Int>) {
    val context = LocalContext.current
    val audioFacts = remember(context) { AudioCapabilityFacts.from(context) }
    Column(Modifier.fillMaxSize()) {
        Text("ANALYZE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
        Text("Read the sound, not the room.", fontSize = 38.sp, fontWeight = FontWeight.SemiBold)
        Text("A live pitch trace appears after the tuner locks onto a steady note.", color = MutedText, fontSize = 13.sp)
        Spacer(Modifier.height(18.dp))

        Column(
            Modifier
                .fillMaxWidth()
                .background(Color(0xFF101114), RoundedCornerShape(24.dp))
                .border(1.dp, Color(0xFF303137), RoundedCornerShape(24.dp))
                .padding(18.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Metric(reading.frequencyHz?.let { "%.1f Hz".format(it) } ?: "—", "frequency")
                Metric(reading.cents?.let { "%+d ¢".format(it) } ?: "—", "pitch offset")
                Metric(if (reading.confidence > 0.0) "%.0f%%".format(reading.confidence * 100) else "—", "confidence")
            }
            Spacer(Modifier.height(18.dp))
            PitchTrace(pitchTrace, Modifier.fillMaxWidth().height(150.dp))
            Spacer(Modifier.height(8.dp))
            Text("−50 cents", color = MutedText, fontSize = 8.sp)
            Text("The center line is in tune. The trace is stored only in memory and clears when Bocal closes.", color = Color(0xFFB5B3AC), fontSize = 10.sp)
        }

        Spacer(Modifier.height(12.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .background(Color(0xFF101114), RoundedCornerShape(24.dp))
                .border(1.dp, Color(0xFF303137), RoundedCornerShape(24.dp))
                .padding(18.dp),
        ) {
            Text("DEVICE AUDIO PATH", color = Violet, fontSize = 9.sp, letterSpacing = 1.4.sp)
            Spacer(Modifier.height(10.dp))
            FactRow("Native sample rate", audioFacts.sampleRate)
            FactRow("Output buffer", audioFacts.framesPerBuffer)
            FactRow("Low-latency flag", if (audioFacts.lowLatency) "Available" else "Not advertised")
            FactRow("Pro-audio flag", if (audioFacts.proAudio) "Available" else "Not advertised")
            Spacer(Modifier.height(10.dp))
            Text(
                "Android exposes capability flags, not measured round-trip latency. The physical-device protocol measures that separately.",
                color = MutedText,
                fontSize = 9.sp,
            )
        }
    }
}

@Composable
private fun PitchTrace(values: List<Int>, modifier: Modifier) {
    Box(modifier.background(Color(0xFF0A0B0D), RoundedCornerShape(16.dp))) {
        Canvas(Modifier.fillMaxSize().padding(12.dp)) {
            val centerY = size.height / 2f
            drawLine(Color(0xFF3C3D43), Offset(0f, centerY), Offset(size.width, centerY), 2f)
            if (values.size > 1) {
                val step = size.width / (values.size - 1).coerceAtLeast(1)
                values.zipWithNext().forEachIndexed { index, pair ->
                    fun y(value: Int): Float = centerY - value.coerceIn(-50, 50) / 50f * centerY
                    drawLine(
                        color = if (kotlin.math.abs(pair.second) <= 5) Cyan else Violet,
                        start = Offset(index * step, y(pair.first)),
                        end = Offset((index + 1) * step, y(pair.second)),
                        strokeWidth = 5f,
                        cap = StrokeCap.Round,
                    )
                }
            }
        }
    }
}

@Composable
private fun Metric(value: String, label: String) {
    Column {
        Text(value, color = Color(0xFFE8E5DD), fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = MutedText, fontSize = 8.sp)
    }
}

@Composable
private fun FactRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Color(0xFFB8B6AF), fontSize = 10.sp)
        Text(value, color = Color(0xFFE2DFD6), fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

private data class AudioCapabilityFacts(
    val sampleRate: String,
    val framesPerBuffer: String,
    val lowLatency: Boolean,
    val proAudio: Boolean,
) {
    companion object {
        fun from(context: Context): AudioCapabilityFacts {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val packageManager = context.packageManager
            return AudioCapabilityFacts(
                sampleRate = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE) ?: "Unknown",
                framesPerBuffer = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER) ?: "Unknown",
                lowLatency = packageManager.hasSystemFeature(PackageManager.FEATURE_AUDIO_LOW_LATENCY),
                proAudio = packageManager.hasSystemFeature(PackageManager.FEATURE_AUDIO_PRO),
            )
        }
    }
}
