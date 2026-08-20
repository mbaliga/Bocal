package com.bocal.music.ui

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.bocal.music.audio.TunerEngine
import com.bocal.music.audio.TunerReading
import com.bocal.music.data.AppPreferences
import com.bocal.music.data.InstrumentCatalog
import com.bocal.music.data.NavigationSide
import kotlinx.coroutines.delay

@Composable
fun BocalApp() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val preferences = remember(context) { AppPreferences(context) }
    val engine = remember(context) { TunerEngine(context.applicationContext) }
    var sectionName by rememberSaveable { mutableStateOf(AppSection.TUNE.name) }
    val section = AppSection.entries.firstOrNull { it.name == sectionName } ?: AppSection.TUNE
    var instrumentIndex by rememberSaveable { mutableStateOf(0) }
    var reading by remember { mutableStateOf(TunerReading(TunerReading.State.READY)) }
    var pitchTrace by remember { mutableStateOf(emptyList<Int>()) }
    var listening by rememberSaveable { mutableStateOf(false) }
    var showOnboarding by rememberSaveable { mutableStateOf(!preferences.hasFinishedOnboarding()) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var navigationSideName by rememberSaveable { mutableStateOf(preferences.navigationSide().name) }
    val navigationSide = NavigationSide.entries.firstOrNull { it.name == navigationSideName } ?: NavigationSide.LEFT
    val instrument = InstrumentCatalog.instruments[instrumentIndex]

    engine.onReading = { update ->
        reading = update
        if (update.state == TunerReading.State.LOCKED && update.cents != null) {
            pitchTrace = (pitchTrace + update.cents).takeLast(72)
        }
        if (update.state == TunerReading.State.READY || update.state == TunerReading.State.ERROR) listening = false
    }

    fun stopListening() {
        if (listening) engine.stop()
        listening = false
    }

    fun selectSection(next: AppSection) {
        if (next != AppSection.TUNE) stopListening()
        if (next == AppSection.LAB) instrumentIndex = 0
        sectionName = next.name
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            listening = engine.start(instrument.writtenOffset)
        } else {
            reading = TunerReading(TunerReading.State.ERROR, message = "Microphone access is off. You can enable it in Android settings.")
        }
    }

    DisposableEffect(lifecycleOwner, engine) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                engine.stop()
                listening = false
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            engine.release()
        }
    }

    if (showOnboarding) {
        OnboardingGuide {
            preferences.setOnboardingComplete(true)
            showOnboarding = false
        }
        return
    }

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        val landscape = maxWidth > maxHeight
        if (landscape) {
            Row(Modifier.fillMaxSize()) {
                if (navigationSide == NavigationSide.LEFT) {
                    ArcNavigation(section, ::selectSection, true, navigationSide, Modifier.width(86.dp))
                }
                AppBody(
                    modifier = Modifier.weight(1f),
                    section = section,
                    instrumentName = if (section == AppSection.LAB) "Alto saxophone · E♭" else "${instrument.name} · ${instrument.pitchLabel}",
                    onSwitchInstrument = {
                        stopListening()
                        instrumentIndex = (instrumentIndex + 1) % InstrumentCatalog.instruments.size
                    },
                    onOpenSettings = { showSettings = true },
                    reading = reading,
                    listening = listening,
                    pitchTrace = pitchTrace,
                    onListen = {
                        if (listening) stopListening()
                        else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            listening = engine.start(instrument.writtenOffset)
                        } else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    },
                )
                if (navigationSide == NavigationSide.RIGHT) {
                    ArcNavigation(section, ::selectSection, true, navigationSide, Modifier.width(86.dp))
                }
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                AppBody(
                    modifier = Modifier.weight(1f),
                    section = section,
                    instrumentName = if (section == AppSection.LAB) "Alto saxophone · E♭" else "${instrument.name} · ${instrument.pitchLabel}",
                    onSwitchInstrument = {
                        stopListening()
                        instrumentIndex = (instrumentIndex + 1) % InstrumentCatalog.instruments.size
                    },
                    onOpenSettings = { showSettings = true },
                    reading = reading,
                    listening = listening,
                    pitchTrace = pitchTrace,
                    onListen = {
                        if (listening) stopListening()
                        else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            listening = engine.start(instrument.writtenOffset)
                        } else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    },
                )
                ArcNavigation(section, ::selectSection, false, navigationSide)
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            navigationSide = navigationSide,
            onNavigationSide = { side ->
                navigationSideName = side.name
                preferences.setNavigationSide(side)
            },
            onReplayOnboarding = {
                showSettings = false
                showOnboarding = true
            },
            onDismiss = { showSettings = false },
        )
    }
}

@Composable
private fun AppBody(
    modifier: Modifier,
    section: AppSection,
    instrumentName: String,
    onSwitchInstrument: () -> Unit,
    onOpenSettings: () -> Unit,
    reading: TunerReading,
    listening: Boolean,
    pitchTrace: List<Int>,
    onListen: () -> Unit,
) {
    Column(modifier.fillMaxSize().padding(horizontal = 15.dp, vertical = 10.dp)) {
        Header(instrumentName, onSwitchInstrument, onOpenSettings)
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when (section) {
                AppSection.TUNE -> TunerScreen(reading, listening, onListen)
                AppSection.LAB -> SaxophoneLabScreen()
                AppSection.PULSE -> PulseScreen()
                AppSection.ANALYZE -> AnalysisScreen(reading, pitchTrace)
                AppSection.PRACTICE -> PracticeScreen()
            }
        }
    }
}

@Composable
private fun Header(instrumentName: String, onSwitch: () -> Unit, onSettings: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(
                Modifier.size(34.dp).background(Brush.linearGradient(listOf(Cyan, Color(0xFF4FE8C9))), RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center,
            ) { Text("≋", color = Color(0xFF06201C), fontSize = 20.sp, fontWeight = FontWeight.Bold) }
            Text("bocal", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Button(
                onClick = onSwitch,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1C1934)),
                shape = RoundedCornerShape(13.dp),
            ) { Text(instrumentName, color = Color(0xFFC4BBFF), fontSize = 10.sp) }
            OutlinedButton(onClick = onSettings, shape = RoundedCornerShape(13.dp)) { Text("•••", fontSize = 12.sp) }
        }
    }
}

@Composable
private fun TunerScreen(reading: TunerReading, listening: Boolean, onListen: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val landscape = maxWidth > maxHeight
        if (landscape) {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                TunerIntro(Modifier.weight(0.68f).fillMaxHeight())
                TunerDisplay(reading, listening, onListen, Modifier.weight(1.32f).fillMaxHeight())
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                Text("TUNE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
                Text("Find the center.", fontSize = 38.sp, fontWeight = FontWeight.SemiBold)
                Text("Written pitch first. Concert pitch stays visible.", color = MutedText, fontSize = 13.sp)
                Spacer(Modifier.height(14.dp))
                TunerDisplay(reading, listening, onListen, Modifier.fillMaxWidth().weight(1f))
            }
        }
    }
}

@Composable
private fun TunerIntro(modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.Center) {
        Text("TUNE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
        Text("Find the center.", fontSize = 42.sp, lineHeight = 45.sp, fontWeight = FontWeight.SemiBold)
        Text("Play one clean, steady note. Bocal waits for confidence before it names the pitch.", color = MutedText, fontSize = 13.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun TunerDisplay(reading: TunerReading, listening: Boolean, onListen: () -> Unit, modifier: Modifier) {
    BoxWithConstraints(
        modifier
            .background(Brush.radialGradient(listOf(Color(0xFF211D3D), Color(0xFF101114))), RoundedCornerShape(26.dp))
            .border(1.dp, Color(0xFF34343A), RoundedCornerShape(26.dp))
            .padding(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        val compact = maxHeight < 390.dp
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(reading.message.uppercase(), color = if (reading.message == "Centered") Cyan else Violet, fontSize = 10.sp, letterSpacing = 1.5.sp)
            Spacer(Modifier.height(if (compact) 5.dp else 12.dp))
            Text(
                if (reading.writtenOctave == null) "—" else "${reading.writtenNote}${reading.writtenOctave}",
                fontSize = if (compact) 66.sp else 92.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
            TuningArc(reading.cents ?: 0, reading.cents != null, Modifier.fillMaxWidth().height(if (compact) 50.dp else 76.dp))
            Text(
                reading.cents?.let { "${if (it > 0) "+" else ""}$it cents" } ?: "No note until the signal is steady",
                color = Color(0xFFB0AEA7),
                fontSize = 11.sp,
            )
            Text(
                reading.frequencyHz?.let { "%.1f Hz · concert %s%d".format(it, reading.concertNote, reading.concertOctave) } ?: "Silence stays blank",
                color = MutedText,
                fontSize = 9.sp,
            )
            Spacer(Modifier.height(if (compact) 8.dp else 17.dp))
            Button(onClick = onListen, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(15.dp)) {
                Text(if (listening) "Stop listening" else "Start live tuner", fontWeight = FontWeight.Bold)
            }
            Text("Audio is analyzed here and never uploaded.", color = Color(0xFF747478), fontSize = 8.sp, modifier = Modifier.padding(top = 7.dp))
        }
    }
}

@Composable
private fun TuningArc(cents: Int, active: Boolean, modifier: Modifier) {
    Canvas(modifier.padding(horizontal = 14.dp)) {
        val y = size.height * 0.62f
        drawLine(Color(0xFF48484F), Offset(0f, y), Offset(size.width, y), 4f, StrokeCap.Round)
        val x = size.width * (cents.coerceIn(-50, 50) + 50) / 100f
        drawCircle(if (active) Cyan else Color(0xFF55555B), 11f, Offset(x, y))
        drawLine(Color(0xFFD8D5CC), Offset(x, y - 17f), Offset(x, y + 17f), 2f)
    }
}

@Composable
private fun PulseScreen() {
    var bpm by rememberSaveable { mutableFloatStateOf(96f) }
    var running by rememberSaveable { mutableStateOf(false) }
    var beat by remember { mutableStateOf(0) }
    val toneGenerator = remember { runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 72) }.getOrNull() }

    DisposableEffect(toneGenerator) { onDispose { toneGenerator?.release() } }
    LaunchedEffect(running, bpm, toneGenerator) {
        if (!running || toneGenerator == null) return@LaunchedEffect
        var nextBeat = SystemClock.elapsedRealtimeNanos()
        val interval = (60_000_000_000.0 / bpm).toLong()
        while (running) {
            beat = (beat + 1) % 4
            toneGenerator.startTone(if (beat == 0) ToneGenerator.TONE_PROP_BEEP2 else ToneGenerator.TONE_PROP_BEEP, 55)
            nextBeat += interval
            val waitMs = ((nextBeat - SystemClock.elapsedRealtimeNanos()) / 1_000_000L).coerceAtLeast(1L)
            delay(waitMs)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Text("PULSE", color = Cyan, fontSize = 11.sp, letterSpacing = 2.sp)
        Text("Own the time.", fontSize = 38.sp, fontWeight = FontWeight.SemiBold)
        Text("A focused native click for slow work, loops and long tones.", color = MutedText, fontSize = 13.sp)
        Spacer(Modifier.height(18.dp))
        Column(
            Modifier.fillMaxWidth().background(Brush.radialGradient(listOf(Color(0xFF25213F), Color(0xFF101114))), RoundedCornerShape(26.dp)).border(1.dp, Color(0xFF34343A), RoundedCornerShape(26.dp)).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(4) { index ->
                    Box(Modifier.size(if (index == beat && running) 18.dp else 11.dp).background(if (index == beat && running) Cyan else Color(0xFF45454B), CircleShape))
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(bpm.toInt().toString(), fontSize = 88.sp, fontWeight = FontWeight.Medium)
            Text("beats per minute", color = MutedText)
            Slider(value = bpm, onValueChange = { bpm = it }, valueRange = 30f..240f)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("30", color = MutedText, fontSize = 9.sp)
                Text("240", color = MutedText, fontSize = 9.sp)
            }
            Spacer(Modifier.height(14.dp))
            Button(onClick = { running = !running }, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(15.dp)) {
                Text(if (running) "Stop pulse" else "Start pulse", fontWeight = FontWeight.Bold)
            }
            Text("The physical-device suite checks timing drift and interruption behavior.", color = MutedText, fontSize = 8.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun SettingsDialog(
    navigationSide: NavigationSide,
    onNavigationSide: (NavigationSide) -> Unit,
    onReplayOnboarding: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Color(0xFF111216), RoundedCornerShape(26.dp))
                .border(1.dp, Color(0xFF393A41), RoundedCornerShape(26.dp))
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Text("Settings", fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
            Text("Keep the landscape arc where your hand expects it.", color = MutedText, fontSize = 11.sp)
            Spacer(Modifier.height(18.dp))
            Text("LANDSCAPE NAVIGATION", color = Violet, fontSize = 9.sp, letterSpacing = 1.3.sp)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NavigationSide.entries.forEach { side ->
                    Button(
                        onClick = { onNavigationSide(side) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = if (navigationSide == side) Color(0xFF17463E) else Color(0xFF202126)),
                    ) { Text(side.name.lowercase().replaceFirstChar(Char::uppercase), color = if (navigationSide == side) Cyan else Color(0xFFC3C1BA)) }
                }
            }
            Spacer(Modifier.height(14.dp))
            HorizontalDivider(color = Color(0xFF313238))
            Spacer(Modifier.height(14.dp))
            OutlinedButton(onClick = onReplayOnboarding, modifier = Modifier.fillMaxWidth()) { Text("Replay onboarding") }
            Spacer(Modifier.height(7.dp))
            Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Done", fontWeight = FontWeight.Bold) }
        }
    }
}
