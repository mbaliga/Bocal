package com.bocal.music.ui

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bocal.music.data.PracticeRepository
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date

@Composable
fun PracticeScreen() {
    val context = LocalContext.current
    val repository = remember(context) { PracticeRepository(context) }
    var sessions by remember { mutableStateOf(repository.sessions()) }
    var activeStart by rememberSaveable { mutableLongStateOf(repository.activeStartMs()) }
    var elapsedSeconds by rememberSaveable {
        mutableIntStateOf(if (activeStart > 0L) ((System.currentTimeMillis() - activeStart) / 1_000L).toInt() else 0)
    }
    var focus by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(activeStart) {
        while (activeStart > 0L) {
            elapsedSeconds = ((System.currentTimeMillis() - activeStart) / 1_000L).toInt().coerceAtLeast(0)
            delay(1_000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Text("PRACTICE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
        Text("Make the session count.", fontSize = 38.sp, fontWeight = FontWeight.SemiBold)
        Text("Timing, focus and notes stay on this phone.", color = MutedText, fontSize = 13.sp)
        Spacer(Modifier.height(18.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(formatDuration(repository.totalSeconds()), "saved practice", Modifier.weight(1f))
            MetricCard(sessions.size.toString(), "sessions", Modifier.weight(1f))
            MetricCard(formatDuration(elapsedSeconds), if (activeStart > 0L) "running now" else "ready", Modifier.weight(1f), activeStart > 0L)
        }
        Spacer(Modifier.height(12.dp))

        Column(
            Modifier
                .fillMaxWidth()
                .background(Color(0xFF101114), RoundedCornerShape(24.dp))
                .border(1.dp, Color(0xFF303137), RoundedCornerShape(24.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(if (activeStart > 0L) "Session in progress" else "Start a focused block", fontSize = 20.sp, fontWeight = FontWeight.Medium)
            Text(formatDuration(elapsedSeconds), color = if (activeStart > 0L) Cyan else Color(0xFFF2F0E8), fontSize = 54.sp, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = focus,
                onValueChange = { focus = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("What are you working on?") },
                singleLine = true,
            )
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Notes for next time") },
                minLines = 2,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                if (activeStart == 0L) {
                    Button(
                        onClick = {
                            val now = System.currentTimeMillis()
                            repository.startSession(now)
                            activeStart = now
                            elapsedSeconds = 0
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Start practice", fontWeight = FontWeight.Bold) }
                } else {
                    Button(
                        onClick = {
                            repository.finishSession(elapsedSeconds, focus, notes)
                            sessions = repository.sessions()
                            activeStart = 0L
                            elapsedSeconds = 0
                            focus = ""
                            notes = ""
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Save session", fontWeight = FontWeight.Bold) }
                    Button(
                        onClick = {
                            repository.cancelSession()
                            activeStart = 0L
                            elapsedSeconds = 0
                        },
                        modifier = Modifier.weight(0.72f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF24242A)),
                    ) { Text("Discard") }
                }
            }
            Text("No account and no upload. Clearing the app’s storage removes this history.", color = MutedText, fontSize = 9.sp)
        }

        Spacer(Modifier.height(18.dp))
        Text("RECENT SESSIONS", color = Violet, fontSize = 10.sp, letterSpacing = 1.4.sp)
        Spacer(Modifier.height(9.dp))
        if (sessions.isEmpty()) {
            Box(
                Modifier.fillMaxWidth().background(Color(0xFF101114), RoundedCornerShape(20.dp)).padding(22.dp),
            ) { Text("Your first saved session will appear here.", color = MutedText, fontSize = 12.sp) }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                sessions.take(8).forEach { session ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF101114), RoundedCornerShape(18.dp))
                            .border(1.dp, Color(0xFF292A2F), RoundedCornerShape(18.dp))
                            .padding(15.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(session.focus, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                            Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(session.startedAtMs)), color = MutedText, fontSize = 9.sp)
                            if (session.notes.isNotBlank()) Text(session.notes, color = Color(0xFFB6B4AD), fontSize = 10.sp)
                        }
                        Text(formatDuration(session.durationSeconds), color = Cyan, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun MetricCard(value: String, label: String, modifier: Modifier, active: Boolean = false) {
    Column(
        modifier
            .background(if (active) Color(0xFF11322C) else Color(0xFF101114), RoundedCornerShape(18.dp))
            .border(1.dp, if (active) Color(0xFF28685D) else Color(0xFF2D2E33), RoundedCornerShape(18.dp))
            .padding(13.dp),
    ) {
        Text(value, color = if (active) Cyan else Color(0xFFE4E1D9), fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = MutedText, fontSize = 8.sp)
    }
}

internal fun formatDuration(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    val hours = safe / 3_600
    val minutes = (safe % 3_600) / 60
    val remainder = safe % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, remainder) else "%02d:%02d".format(minutes, remainder)
}
