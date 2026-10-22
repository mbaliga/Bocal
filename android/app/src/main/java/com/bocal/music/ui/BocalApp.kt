package com.bocal.music.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.WebViewAssetLoader
import com.bocal.music.BuildConfig
import com.bocal.music.audio.MetronomeEngine
import com.bocal.music.audio.PitchMath
import com.bocal.music.audio.PitchStabilizer
import com.bocal.music.audio.ReferenceToneEngine
import com.bocal.music.audio.TunerEngine
import com.bocal.music.audio.YinPitchDetector
import com.bocal.music.data.BocalBundleExporter
import com.bocal.music.data.PracticeSession
import com.bocal.music.data.PracticeStore
import java.time.Instant
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

private enum class Screen(val title: String, val glyph: String) {
    TUNE("Tune", "◉"),
    LAB("Lab", "⌘"),
    SOUND("Sound", "♪"),
    PULSE("Pulse", "≈"),
    ANALYZE("Analyze", "∿"),
    PRACTICE("Practice", "◎"),
}

private enum class InstrumentProfile(
    val id: String,
    val title: String,
    val shortTitle: String,
    val keyLabel: String,
    val heroTitle: String,
    val heroCopy: String,
    val visualLabel: String,
    val visualAccent: Color,
    val validationLabel: String,
    val labBoundary: String,
) {
    ALTO_SAX(
        id = "alto-sax",
        title = "Alto saxophone",
        shortTitle = "Alto",
        keyLabel = "E♭",
        heroTitle = "Validated alto fingering",
        heroCopy = "Detailed mesh, 23 touch-pieces and validated written fingerings. Bocal shows touch first, then the linked mechanism.",
        visualLabel = "SAX · VALIDATED",
        visualAccent = BocalGold,
        validationLabel = "Validated fingering",
        labBoundary = "Detailed mesh with validated fingering overlay."
    ),
    OBOE(
        id = "oboe",
        title = "Howarth S20C oboe",
        shortTitle = "Oboe",
        keyLabel = "C",
        heroTitle = "Mechanism anatomy preview",
        heroCopy = "Optimized Howarth S20C anatomy model with selectable parts. Fingering remains gated until review.",
        visualLabel = "OBOE · PREVIEW",
        visualAccent = BocalViolet,
        validationLabel = "Anatomy preview",
        labBoundary = "Detailed mechanism preview, not a fingering trainer."
    ),
}

@Composable
fun BocalApp() {
    var screen by remember { mutableStateOf(Screen.TUNE) }
    var instrument by remember { mutableStateOf(InstrumentProfile.ALTO_SAX) }

    Scaffold(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            BocalBottomChrome(
                screen = screen,
                onScreen = { screen = it },
                instrument = instrument,
                onInstrument = { instrument = it },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (screen) {
                Screen.TUNE -> TuneScreen(instrument = instrument, onOpenLab = { screen = Screen.LAB })
                Screen.LAB -> LabScreen(instrument = instrument)
                Screen.SOUND -> SoundScreen(instrument = instrument)
                Screen.PULSE -> PulseScreen(instrument = instrument)
                Screen.ANALYZE -> AnalyzeScreen(instrument = instrument)
                Screen.PRACTICE -> PracticeScreen(instrument = instrument)
            }
        }
    }
}

@Composable
private fun BocalBottomChrome(
    screen: Screen,
    onScreen: (Screen) -> Unit,
    instrument: InstrumentProfile,
    onInstrument: (InstrumentProfile) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FloatingRoundButton(label = "3D") { onScreen(Screen.LAB) }
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(28.dp),
                color = Color(0xFFF3F3F5).copy(alpha = 0.14f),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    InstrumentProfile.entries.forEach { entry ->
                        val selected = entry == instrument
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(22.dp))
                                .background(if (selected) Color(0xFFF5F5F7) else Color.Transparent)
                                .clickable { onInstrument(entry) }
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                entry.shortTitle,
                                color = if (selected) Color(0xFF121316) else Color(0xFFC9CBD1),
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                fontSize = 13.sp,
                            )
                        }
                    }
                }
            }
            FloatingRoundButton(label = "♪") { onScreen(Screen.PRACTICE) }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(34.dp),
            color = Color(0xFFF5F5F7).copy(alpha = 0.11f),
            tonalElevation = 0.dp,
            shadowElevation = 0.dp,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Screen.entries.forEach { item ->
                    val selected = item == screen
                    if (selected) {
                        Row(
                            modifier = Modifier
                                .weight(1.8f)
                                .testTag("nav-${item.name.lowercase()}")
                                .semantics { this.selected = true }
                                .clip(RoundedCornerShape(26.dp))
                                .background(Color(0xFFF4F4F6))
                                .clickable { onScreen(item) }
                                .padding(horizontal = 16.dp, vertical = 16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(item.glyph, color = Color(0xFF1B1D21), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            Text(item.title, color = Color(0xFF15171B), fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .testTag("nav-${item.name.lowercase()}")
                                .semantics { this.selected = false }
                                .clip(RoundedCornerShape(22.dp))
                                .clickable { onScreen(item) }
                                .padding(vertical = 14.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(item.glyph, color = Color(0xFFB8BAC0), fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FloatingRoundButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(50.dp)
            .clip(CircleShape)
            .background(Color(0xFFF5F5F7))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color(0xFF15171B), fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun WorkspacePage(
    screen: Screen,
    instrument: InstrumentProfile,
    eyebrow: String,
    title: String,
    body: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        WorkspaceHero(
            screen = screen,
            instrument = instrument,
            eyebrow = eyebrow,
            title = title,
            body = body,
        )
        content()
        Spacer(Modifier.height(100.dp))
    }
}

@Composable
private fun WorkspaceHero(
    screen: Screen,
    instrument: InstrumentProfile,
    eyebrow: String,
    title: String,
    body: String,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0F1013)),
        shape = RoundedCornerShape(28.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(Color(0xFF181A1F), instrument.visualAccent.copy(alpha = 0.28f), Color(0xFF0D0E11))
                    )
                )
                .padding(18.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Eyebrow(eyebrow)
                        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
                        Text(body, color = Color(0xFFC8CAD0), style = MaterialTheme.typography.bodyMedium)
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(18.dp))
                            .background(Color(0xFF111318).copy(alpha = 0.65f))
                            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(screen.title.uppercase(), color = Color(0xFFEFF0F2), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Text("${instrument.shortTitle} · ${instrument.keyLabel}", color = instrument.visualAccent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                HeroVisualStrip(instrument = instrument)
            }
        }
    }
}

@Composable
private fun HeroVisualStrip(instrument: InstrumentProfile) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        HeroVisualCard(
            modifier = Modifier.weight(1.2f),
            accent = instrument.visualAccent,
            title = instrument.visualLabel,
            subtitle = instrument.validationLabel,
            large = true,
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            HeroVisualCard(accent = Color(0xFF4CF1DE), title = "SIGNAL TRUTH", subtitle = "Explicit evidence", large = false)
            HeroVisualCard(accent = Color(0xFFECC56A), title = "LEARN BY TOUCH", subtitle = "Controls, parts, notes", large = false)
        }
    }
}

@Composable
private fun HeroVisualCard(
    modifier: Modifier = Modifier,
    accent: Color,
    title: String,
    subtitle: String,
    large: Boolean,
) {
    Box(
        modifier = modifier
            .height(if (large) 160.dp else 75.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF0B0C10), accent.copy(alpha = if (large) 0.42f else 0.28f), Color(0xFF151821))
                )
            )
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(22.dp))
            .padding(14.dp)
    ) {
        Column(verticalArrangement = Arrangement.SpaceBetween) {
            Box(
                modifier = Modifier
                    .size(if (large) 42.dp else 28.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(accent.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (large) "◈" else "•", color = accent, fontWeight = FontWeight.Black)
            }
            Column {
                Text(title, color = Color(0xFFECEDEF), fontWeight = FontWeight.Black, fontSize = if (large) 18.sp else 12.sp)
                Text(subtitle, color = Color(0xFFB9BCC4), fontSize = if (large) 12.sp else 10.sp)
            }
        }
    }
}

@Composable
private fun Eyebrow(text: String) {
    Text(text, color = BocalViolet, fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
}

@Composable
private fun VisualInfoCard(
    eyebrow: String,
    title: String,
    copy: String,
    accent: Color,
    modifier: Modifier = Modifier,
    actions: @Composable (() -> Unit)? = null,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color(0xFF101216)),
        shape = RoundedCornerShape(24.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Eyebrow(eyebrow)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF13161C), accent.copy(alpha = 0.36f), Color(0xFF0A0C0F))))
                    .padding(14.dp)
            ) {
                Column(verticalArrangement = Arrangement.SpaceBetween) {
                    Text("◌  Premium preview", color = Color.White.copy(alpha = 0.86f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
                }
            }
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(copy, style = MaterialTheme.typography.bodySmall, color = Color(0xFFA9ACB4))
            actions?.invoke()
        }
    }
}

@Composable
private fun TuneScreen(instrument: InstrumentProfile, onOpenLab: () -> Unit) {
    val context = LocalContext.current
    var rawResult by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var stableResult by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var listening by remember { mutableStateOf(false) }
    var microphoneMessage by remember { mutableStateOf<String?>(null) }
    var a4 by remember { mutableFloatStateOf(440f) }
    var tolerance by remember { mutableFloatStateOf(10f) }
    var transposition by remember { mutableIntStateOf(instrumentTransposition(instrument)) }
    val centsTrace = remember { mutableStateListOf<Float>() }
    val stabilizer = remember { PitchStabilizer() }
    val engine = remember {
        TunerEngine { detected ->
            rawResult = detected
            stableResult = stabilizer.update(detected)
        }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            microphoneMessage = null
            listening = engine.start()
            if (!listening) microphoneMessage = "Bocal could not open this microphone route."
        } else {
            microphoneMessage = "Microphone permission is required only while you choose to tune or analyze."
        }
    }
    LaunchedEffect(instrument) { transposition = instrumentTransposition(instrument) }
    DisposableEffect(Unit) {
        onDispose {
            stabilizer.reset()
            engine.close()
        }
    }
    OnAppStop {
        if (listening) {
            engine.stop()
            stabilizer.reset()
            rawResult = null
            stableResult = null
            listening = false
        }
    }

    val pitch = PitchMath.from(stableResult, a4, transposition)
    val inTune = pitch != null && abs(pitch.cents) <= tolerance
    LaunchedEffect(pitch?.frequencyHz, pitch?.cents) {
        pitch?.let {
            if (centsTrace.size >= 90) centsTrace.removeAt(0)
            centsTrace.add(it.cents.coerceIn(-50f, 50f))
        }
    }

    val status = when {
        !listening -> "READY"
        pitch != null -> "STABLE"
        rawResult != null -> "STABILIZING"
        else -> "LISTENING"
    }
    val guidance = when {
        !listening -> "Start the tuner, then play one clean long tone."
        pitch != null -> "${signed(pitch.cents)} cents · ${if (inTune) "centered" else if (pitch.cents < 0) "flat" else "sharp"}"
        rawResult != null -> "Hold the note steady while Bocal confirms it."
        else -> "Waiting for a stable tone."
    }

    WorkspacePage(
        screen = Screen.TUNE,
        instrument = instrument,
        eyebrow = "TUNE WORKSPACE",
        title = "Written pitch first. Evidence second.",
        body = "The tuner stays legible, the instrument context stays visible, and the next action is obvious.",
    ) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Eyebrow(status)
                Spacer(Modifier.height(10.dp))
                Text(
                    pitch?.writtenNote ?: "—",
                    fontSize = 84.sp,
                    fontWeight = FontWeight.Black,
                    color = if (inTune) BocalCyan else MaterialTheme.colorScheme.primary,
                )
                Text(pitch?.writtenOctave?.toString() ?: "", style = MaterialTheme.typography.headlineSmall)
                Text(
                    pitch?.let { "${it.frequencyHz.format(1)} Hz · ${it.concertNote}${it.concertOctave} concert" } ?: guidance,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(18.dp))
                PitchGauge(cents = pitch?.cents, tolerance = tolerance)
                Text(
                    if (pitch != null) guidance else "±${tolerance.roundToInt()} cents target",
                    color = if (inTune) BocalCyan else MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    modifier = Modifier.testTag("tuner-toggle"),
                    onClick = {
                        microphoneMessage = null
                        if (listening) {
                            engine.stop()
                            stabilizer.reset()
                            stableResult = null
                            rawResult = null
                            listening = false
                        } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            stabilizer.reset()
                            listening = engine.start()
                            if (!listening) microphoneMessage = "Bocal could not open this microphone route."
                        } else {
                            launcher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                ) { Text(if (listening) "Stop live tuner" else "Start live tuner") }
                Text("Audio is analyzed on this device and is not uploaded.", style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
        }

        microphoneMessage?.let { message ->
            Card(shape = RoundedCornerShape(20.dp)) { Text(message, Modifier.fillMaxWidth().padding(14.dp), style = MaterialTheme.typography.bodySmall) }
        }

        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            listOf(
                "Concert" to 0,
                "E♭ winds" to 9,
                "B♭ winds" to 2,
            ).forEach { (label, shift) ->
                FilterChip(selected = transposition == shift, onClick = { transposition = shift }, label = { Text(label) })
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            VisualInfoCard(
                eyebrow = "3D LAB",
                title = instrument.heroTitle,
                copy = instrument.heroCopy,
                accent = instrument.visualAccent,
                modifier = Modifier.weight(1f),
                actions = {
                    Button(
                        onClick = onOpenLab,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = BocalCyan, contentColor = Color(0xFF05211C))
                    ) { Text("Open 3D lab", fontWeight = FontWeight.Bold) }
                }
            )
            VisualInfoCard(
                eyebrow = "CURRENT EVIDENCE",
                title = "Measured here. Never guessed.",
                copy = "Stable pitch, confidence and cents remain explicit. Low-confidence frames do not become notes.",
                accent = BocalViolet,
                modifier = Modifier.weight(1f),
            )
        }

        Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF0F1115))) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Eyebrow("SIGNAL TRUTH")
                Text(if (pitch == null) "Start with one clean long tone." else "Stable written pitch confirmed. Now adjust by cents, not by color.")
                PitchTrace(centsTrace)
                Metric("Stable pitch", pitch?.let { "${it.writtenNote}${it.writtenOctave}" } ?: "—")
                Metric("Confidence", pitch?.let { "${(it.confidence * 100).roundToInt()}%" } ?: "—")
                Metric("Deviation", pitch?.let { "${signed(it.cents)} cents" } ?: "—")
            }
        }

        SettingSlider("Reference pitch", a4, 430f..450f, "${a4.roundToInt()} Hz") { a4 = it }
        SettingSlider("In-tune window", tolerance, 2f..25f, "±${tolerance.roundToInt()} cents") { tolerance = it }
        Text(
            "Pitch detection is a clean-room YIN-style implementation with a stability gate. Device, range and latency validation are still required before a production accuracy claim.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun PitchGauge(cents: Float?, tolerance: Float) {
    Canvas(Modifier.fillMaxWidth().height(62.dp).semantics { contentDescription = cents?.let { "${signed(it)} cents" } ?: "No pitch" }) {
        val centerY = size.height * 0.56f
        drawLine(Color.Gray, Offset(0f, centerY), Offset(size.width, centerY), 3f, StrokeCap.Round)
        val band = tolerance / 50f * size.width / 2f
        drawLine(BocalCyan.copy(alpha = 0.5f), Offset(size.width / 2f - band, centerY), Offset(size.width / 2f + band, centerY), 12f, StrokeCap.Round)
        drawLine(Color.Gray, Offset(size.width / 2f, 6f), Offset(size.width / 2f, size.height - 4f), 2f)
        cents?.let {
            val x = size.width / 2f + it.coerceIn(-50f, 50f) / 100f * size.width
            drawCircle(if (abs(it) <= tolerance) BocalCyan else BocalViolet, radius = 13f, center = Offset(x, centerY))
        }
    }
}

@Composable
private fun PitchTrace(values: List<Float>) {
    val summary = if (values.isEmpty()) {
        "Pitch trace has no stable samples"
    } else {
        val minimum = values.minOrNull() ?: 0f
        val maximum = values.maxOrNull() ?: 0f
        val mean = values.average().toFloat()
        "Pitch trace ${values.size} samples, minimum ${signed(minimum)} cents, maximum ${signed(maximum)} cents, mean ${signed(mean)} cents"
    }
    Canvas(Modifier.fillMaxWidth().height(100.dp).semantics { contentDescription = summary }) {
        drawLine(Color.Gray.copy(alpha = 0.5f), Offset(0f, size.height / 2f), Offset(size.width, size.height / 2f), 2f)
        if (values.size > 1) {
            val path = Path()
            values.forEachIndexed { index, value ->
                val x = index.toFloat() / (values.size - 1) * size.width
                val y = size.height / 2f - value / 50f * size.height * 0.42f
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, BocalCyan, style = Stroke(width = 5f, cap = StrokeCap.Round))
        }
    }
}

@Composable
private fun SettingSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, output: String, onValue: (Float) -> Unit) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label, fontWeight = FontWeight.Bold)
                Text(output)
            }
            Slider(value = value, onValueChange = onValue, valueRange = range)
        }
    }
}

@Composable
@SuppressLint("SetJavaScriptEnabled") // Required by the bundled Lab; all non-appassets requests are rejected below.
private fun LabScreen(instrument: InstrumentProfile) {
    val context = LocalContext.current
    var renderGeneration by remember { mutableIntStateOf(0) }
    val loader = remember {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
    }
    key(renderGeneration, instrument.id) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF070809))
                .testTag("instrument-lab")
                .semantics { contentDescription = "Interactive 3D instrument lab. Controls, note lists, validation status and model credits are available inside the lab." },
            factory = { webContext ->
                WebView(webContext).apply {
                    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
                    setBackgroundColor(android.graphics.Color.rgb(7, 8, 9))
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = false
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    @Suppress("DEPRECATION")
                    run {
                        settings.allowFileAccessFromFileURLs = false
                        settings.allowUniversalAccessFromFileURLs = false
                    }
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.mediaPlaybackRequiresUserGesture = true
                    webViewClient = LocalAssetWebViewClient(loader) { renderGeneration += 1 }
                    loadUrl("https://appassets.androidplatform.net/assets/www/lab.html?instrument=${instrument.id}")
                }
            },
            update = {
                val target = "https://appassets.androidplatform.net/assets/www/lab.html?instrument=${instrument.id}"
                if (it.url != target) it.loadUrl(target)
            },
            onRelease = { it.destroy() },
        )
    }
}

@Composable
private fun PulseScreen(instrument: InstrumentProfile) {
    val context = LocalContext.current
    var bpm by remember { mutableIntStateOf(92) }
    var beats by remember { mutableIntStateOf(4) }
    var subdivisions by remember { mutableIntStateOf(1) }
    var activeBeat by remember { mutableIntStateOf(-1) }
    var running by remember { mutableStateOf(false) }
    var haptics by remember { mutableStateOf(true) }
    val taps = remember { mutableStateListOf<Long>() }
    val currentHaptics by rememberUpdatedState(haptics)
    val engine = remember {
        MetronomeEngine { beat ->
            activeBeat = beat
            if (currentHaptics) vibrate(context, beat == 0)
        }
    }
    LaunchedEffect(running, bpm, beats, subdivisions) {
        if (running) {
            engine.start(bpm, beats, subdivisions)
        } else {
            engine.stop()
            activeBeat = -1
        }
    }
    DisposableEffect(Unit) { onDispose { engine.close() } }
    OnAppStop {
        if (running) {
            running = false
            engine.stop()
            activeBeat = -1
        }
    }

    WorkspacePage(
        screen = Screen.PULSE,
        instrument = instrument,
        eyebrow = "PULSE WORKSPACE",
        title = "A calmer metronome shell.",
        body = "The dock is cleaner, the beat state is more obvious, and preset complexity can come later without cluttering the first-use path.",
    ) {
        Card(shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF101216))) {
            Column(
                Modifier.fillMaxWidth().padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Eyebrow("TEMPO")
                Text(bpm.toString(), fontSize = 74.sp, fontWeight = FontWeight.Black)
                Text("beats per minute")
                Slider(value = bpm.toFloat(), onValueChange = { bpm = it.roundToInt() }, valueRange = 30f..260f)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { bpm = (bpm - 1).coerceAtLeast(30) }) { Text("− 1") }
                    OutlinedButton(onClick = {
                        val now = System.currentTimeMillis()
                        if (taps.isNotEmpty() && now - taps.last() > 2_400) taps.clear()
                        taps.add(now)
                        if (taps.size > 7) taps.removeAt(0)
                        if (taps.size > 1) bpm = (60_000.0 * (taps.size - 1) / (taps.last() - taps.first())).roundToInt().coerceIn(30, 260)
                    }) { Text("Tap tempo") }
                    OutlinedButton(onClick = { bpm = (bpm + 1).coerceAtMost(260) }) { Text("+ 1") }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(2, 3, 4, 5, 6, 7).forEach { count ->
                        FilterChip(selected = beats == count, onClick = { beats = count }, label = { Text("$count/4") })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (1..4).forEach { count ->
                        FilterChip(selected = subdivisions == count, onClick = { subdivisions = count }, label = { Text("×$count") })
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    repeat(beats) { index ->
                        Box(
                            Modifier
                                .size(if (index == 0) 42.dp else 34.dp)
                                .semantics { contentDescription = "Beat ${index + 1}${if (index == activeBeat) ", active" else ""}" }
                                .clip(CircleShape)
                                .background(if (index == activeBeat) BocalCyan else MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text((index + 1).toString(), color = if (index == activeBeat) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                FilterChip(selected = haptics, onClick = { haptics = !haptics }, label = { Text(if (haptics) "Haptics on" else "Haptics off") })
                Button(
                    onClick = { running = !running },
                    colors = ButtonDefaults.buttonColors(containerColor = if (running) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
                ) { Text(if (running) "Stop pulse" else "Start pulse") }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            VisualInfoCard(
                eyebrow = "PRACTICE TEMPLATE",
                title = "Three bars on, one bar silent",
                copy = "Bocal still uses a simple timing core, but the card system now makes future preset templates feel native.",
                accent = BocalGold,
                modifier = Modifier.weight(1f),
            )
            VisualInfoCard(
                eyebrow = "BACKLOG BOUNDARY",
                title = "Advanced pulse remains gated",
                copy = "Preset sequences, random silence, polyrhythm and Link belong in later parity work, not in a cluttered first shell.",
                accent = BocalViolet,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SoundScreen(instrument: InstrumentProfile) {
    var octave by remember { mutableIntStateOf(4) }
    var playing by remember { mutableStateOf<Int?>(null) }
    var waveform by remember { mutableStateOf(ReferenceToneEngine.Waveform.SINE) }
    var a4 by remember { mutableFloatStateOf(440f) }
    val engine = remember { ReferenceToneEngine() }
    LaunchedEffect(playing, waveform, a4) {
        val midi = playing
        if (midi == null) {
            engine.stop()
        } else {
            val hz = PitchMath.frequencyForMidi(midi, a4)
            engine.play(hz, waveform)
        }
    }
    DisposableEffect(Unit) { onDispose { engine.close() } }

    WorkspacePage(
        screen = Screen.SOUND,
        instrument = instrument,
        eyebrow = "SOUND WORKSPACE",
        title = "Reference tones now have their own home.",
        body = "Bocal returns to the six-workspace architecture: Tune, Lab, Sound, Pulse, Analyze and Practice.",
    ) {
        Card(shape = RoundedCornerShape(26.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF101216))) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Eyebrow("REFERENCE TONE")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (2..6).forEach { value ->
                        FilterChip(selected = octave == value, onClick = { octave = value }, label = { Text("Oct $value") })
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PitchMath.noteNames.forEachIndexed { pitchClass, name ->
                        val midi = (octave + 1) * 12 + pitchClass
                        OutlinedButton(onClick = { playing = if (playing == midi) null else midi }) {
                            Text(if (playing == midi) "■ $name" else name)
                        }
                    }
                }
                Text("Waveform", fontWeight = FontWeight.Bold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReferenceToneEngine.Waveform.entries.forEach { value ->
                        FilterChip(
                            selected = waveform == value,
                            onClick = { waveform = value },
                            label = { Text(value.name.lowercase().replaceFirstChar(Char::uppercase)) },
                        )
                    }
                }
                SettingSlider("Reference A", a4, 430f..450f, "${a4.roundToInt()} Hz") { a4 = it }
                Button(onClick = { engine.stop(); playing = null }) { Text("Stop all tones") }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            VisualInfoCard(
                eyebrow = "NEXT RICH IMAGE",
                title = "Exercise cards belong here next",
                copy = "This refreshed screen is ready for future drones, intervals and temperament cards that match the stronger Sax Lab visual language.",
                accent = BocalCyan,
                modifier = Modifier.weight(1f),
            )
            VisualInfoCard(
                eyebrow = "BOUNDARY",
                title = "No borrowed competitor assets",
                copy = "Bocal still needs newly recorded or properly licensed multisamples. The visual system is upgraded without making false content claims.",
                accent = BocalViolet,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AnalyzeScreen(instrument: InstrumentProfile) {
    val context = LocalContext.current
    var rawResult by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var stableResult by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var running by remember { mutableStateOf(false) }
    var microphoneMessage by remember { mutableStateOf<String?>(null) }
    val stabilizer = remember { PitchStabilizer() }
    val engine = remember {
        TunerEngine { detected ->
            rawResult = detected
            stableResult = stabilizer.update(detected)
        }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            microphoneMessage = null
            stabilizer.reset()
            running = engine.start()
            if (!running) microphoneMessage = "Bocal could not open this microphone route."
        } else {
            microphoneMessage = "Microphone permission is required only while you choose to analyze."
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            stabilizer.reset()
            engine.close()
        }
    }
    OnAppStop {
        if (running) {
            engine.stop()
            stabilizer.reset()
            rawResult = null
            stableResult = null
            running = false
        }
    }
    val pitch = PitchMath.from(stableResult, 440f, instrumentTransposition(instrument))
    val captureState = when {
        !running -> "Ready"
        pitch != null -> "Stable pitch"
        rawResult != null -> "Stabilizing"
        else -> "Listening"
    }

    WorkspacePage(
        screen = Screen.ANALYZE,
        instrument = instrument,
        eyebrow = "ANALYZE WORKSPACE",
        title = "Compact evidence, upgraded presentation.",
        body = "The analysis shell is still intentionally small, but the card treatment is now consistent with the richer product language.",
    ) {
        Card(shape = RoundedCornerShape(26.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Eyebrow("TONE SNAPSHOT")
                Metric("Capture state", captureState)
                Metric("Detected pitch", pitch?.let { "${it.writtenNote}${it.writtenOctave}" } ?: "—")
                Metric("Frequency", pitch?.let { "${it.frequencyHz.format(1)} Hz" } ?: "—")
                Metric("Pitch confidence", pitch?.let { "${(it.confidence * 100).roundToInt()}%" } ?: "—")
                Metric("Centering", pitch?.let { "${signed(it.cents)} cents" } ?: "—")
                Button(onClick = {
                    microphoneMessage = null
                    if (running) {
                        engine.stop()
                        stabilizer.reset()
                        rawResult = null
                        stableResult = null
                        running = false
                    } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        stabilizer.reset()
                        running = engine.start()
                        if (!running) microphoneMessage = "Bocal could not open this microphone route."
                    } else {
                        launcher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }) { Text(if (running) "Stop snapshot" else "Start snapshot") }
                microphoneMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            VisualInfoCard(
                eyebrow = "NEXT SURFACE",
                title = "Waveform and spectrum can plug in here",
                copy = "The 0.5 card system makes room for future waveform, harmonic, vibrato and attack cards without redesigning from zero.",
                accent = BocalGold,
                modifier = Modifier.weight(1f),
            )
            VisualInfoCard(
                eyebrow = "BOUNDARY",
                title = "No universal tone grade",
                copy = "Bocal continues to show neutral evidence first. The app does not collapse all tone dimensions into a fake single score.",
                accent = BocalViolet,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Text(value, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PracticeScreen(instrument: InstrumentProfile) {
    val context = LocalContext.current
    val store = remember { PracticeStore(context) }
    var sessions by remember { mutableStateOf(store.sessions()) }
    var startedAt by remember { mutableLongStateOf(0L) }
    var elapsed by remember { mutableIntStateOf(0) }
    var note by remember { mutableStateOf(store.lessonNote()) }
    LaunchedEffect(startedAt) {
        while (startedAt > 0) {
            elapsed = ((System.currentTimeMillis() - startedAt) / 1_000).toInt()
            delay(250)
        }
    }

    WorkspacePage(
        screen = Screen.PRACTICE,
        instrument = instrument,
        eyebrow = "PRACTICE WORKSPACE",
        title = "A more premium practice shell.",
        body = "The visual system now extends beyond one good Sax Lab card: focus cards, session cards and export all share the same language.",
    ) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Eyebrow("SESSION TIMER")
                Text(formatDuration(elapsed), fontSize = 58.sp, fontWeight = FontWeight.Black)
                Button(onClick = {
                    if (startedAt == 0L) {
                        startedAt = System.currentTimeMillis()
                        elapsed = 0
                    } else {
                        store.addSession(PracticeSession(Instant.ofEpochMilli(startedAt).toString(), elapsed, instrument.title, null))
                        startedAt = 0
                        elapsed = 0
                        sessions = store.sessions()
                    }
                }) { Text(if (startedAt == 0L) "Start practice" else "Finish and save") }
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            listOf(
                "Long tones" to "8 min · Center, hold, release",
                "Scale line" to "10 min · D major with a drone",
                "Excerpt loop" to "12 min · Hardest four bars",
            ).forEach { (title, copy) ->
                VisualInfoCard(
                    eyebrow = "FOCUS CARD",
                    title = title,
                    copy = copy,
                    accent = instrument.visualAccent,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Teacher or lesson note") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
        Button(onClick = { store.saveLessonNote(note) }) { Text("Save note on device") }
        HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Recent sessions", fontWeight = FontWeight.Bold)
            TextButton(onClick = { shareSessions(context, sessions) }) { Text("Export") }
        }
        if (sessions.isEmpty()) {
            Text("No completed sessions on this device yet.")
        }
        sessions.take(8).forEach { session ->
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF111319))) {
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(session.instrument, fontWeight = FontWeight.Bold)
                        Text(session.startedAt.take(10), style = MaterialTheme.typography.bodySmall)
                    }
                    Text(formatDuration(session.seconds), fontWeight = FontWeight.Bold)
                }
            }
        }
        Text("All practice data in this reference stays on the device. Production work should add Room migrations, encrypted backup controls and a documented deletion/export policy.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun OnAppStop(onStop: () -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnStop by rememberUpdatedState(onStop)
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) currentOnStop()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

private fun shareSessions(context: Context, sessions: List<PracticeSession>) {
    val intent = BocalBundleExporter.createPracticeShareIntent(context, sessions)
    context.startActivity(Intent.createChooser(intent, "Export Bocal practice bundle"))
}

private fun instrumentTransposition(instrument: InstrumentProfile): Int = when (instrument) {
    InstrumentProfile.ALTO_SAX -> 9
    InstrumentProfile.OBOE -> 0
}

private fun vibrate(context: Context, downbeat: Boolean) {
    val vibrator = if (Build.VERSION.SDK_INT >= 31) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    } ?: return
    val duration = if (downbeat) 28L else 12L
    vibrator.vibrate(VibrationEffect.createOneShot(duration, if (downbeat) 180 else 110))
}

private fun Float.format(decimals: Int): String = ("%." + decimals + "f").format(this)
private fun signed(value: Float): String = if (value >= 0) "+${value.format(1)}" else value.format(1)
private fun formatDuration(seconds: Int): String = "%02d:%02d".format(seconds / 60, seconds % 60)
