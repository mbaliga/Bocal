package com.bocal.music.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.bocal.music.audio.MetronomeEngine
import com.bocal.music.audio.ReferenceToneEngine
import com.bocal.music.audio.TunerEngine
import com.bocal.music.audio.YinPitchDetector
import com.bocal.music.data.PracticeSession
import com.bocal.music.data.PracticeStore
import java.time.Instant
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log2
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

private enum class Screen(val title: String, val shortLabel: String) {
    TUNE("Tune", "T"),
    LAB("3D Lab", "3D"),
    PULSE("Pulse", "P"),
    TONE("Sound", "S"),
    ANALYZE("Analyze", "A"),
    PRACTICE("Practice", "✓"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BocalApp() {
    var screen by remember { mutableStateOf(Screen.TUNE) }
    Scaffold(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("BOCAL", fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                        Text(screen.title, style = MaterialTheme.typography.labelSmall)
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Screen.entries.forEach { item ->
                    NavigationBarItem(
                        selected = screen == item,
                        onClick = { screen = item },
                        icon = { Text(item.shortLabel, fontWeight = FontWeight.Bold) },
                        label = { Text(item.title, maxLines = 1, fontSize = 9.sp) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (screen) {
                Screen.TUNE -> TuneScreen()
                Screen.LAB -> LabScreen()
                Screen.PULSE -> PulseScreen()
                Screen.TONE -> ToneScreen()
                Screen.ANALYZE -> AnalyzeScreen()
                Screen.PRACTICE -> PracticeScreen()
            }
        }
    }
}

private data class PitchUi(
    val frequency: Float,
    val confidence: Float,
    val note: String,
    val octave: Int,
    val cents: Float,
    val concertNote: String,
)

private val noteNames = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")

private fun pitchUi(result: YinPitchDetector.Result?, a4: Float, transposition: Int): PitchUi? {
    result ?: return null
    val concertFloat = 69f + 12f * log2(result.frequencyHz / a4)
    val concertMidi = concertFloat.roundToInt()
    val writtenMidi = concertMidi + transposition
    val targetHz = a4 * Math.pow(2.0, (concertMidi - 69) / 12.0).toFloat()
    val cents = 1_200f * log2(result.frequencyHz / targetHz)
    fun name(midi: Int) = noteNames[((midi % 12) + 12) % 12]
    return PitchUi(
        frequency = result.frequencyHz,
        confidence = result.confidence,
        note = name(writtenMidi),
        octave = floor(writtenMidi / 12f).toInt() - 1,
        cents = cents,
        concertNote = "${name(concertMidi)}${floor(concertMidi / 12f).toInt() - 1}",
    )
}

@Composable
private fun TuneScreen() {
    val context = LocalContext.current
    var result by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var listening by remember { mutableStateOf(false) }
    var a4 by remember { mutableStateOf(440f) }
    var tolerance by remember { mutableStateOf(10f) }
    var transposition by remember { mutableIntStateOf(9) }
    val centsTrace = remember { mutableStateListOf<Float>() }
    val engine = remember {
        TunerEngine { detected ->
            result = detected
            detected?.let {
                val cents = pitchUi(it, a4, transposition)?.cents ?: return@let
                if (centsTrace.size >= 90) centsTrace.removeAt(0)
                centsTrace.add(cents.coerceIn(-50f, 50f))
            }
        }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) listening = engine.start()
    }
    DisposableEffect(Unit) { onDispose { engine.close() } }
    val pitch = pitchUi(result, a4, transposition)
    val inTune = pitch != null && abs(pitch.cents) <= tolerance

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Hear the note. See the correction.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Concert" to 0, "E♭ sax" to 9, "B♭ winds" to 2).forEach { (label, shift) ->
                FilterChip(selected = transposition == shift, onClick = { transposition = shift }, label = { Text(label) })
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(pitch?.note ?: "—", fontSize = 84.sp, fontWeight = FontWeight.Black, color = if (inTune) BocalCyan else MaterialTheme.colorScheme.primary)
                Text(pitch?.octave?.toString() ?: "", style = MaterialTheme.typography.headlineSmall)
                Text(
                    pitch?.let { "${it.frequency.format(1)} Hz · ${it.concertNote} concert" } ?: if (listening) "Play a steady note" else "Microphone is off",
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(18.dp))
                PitchGauge(cents = pitch?.cents, tolerance = tolerance)
                Text(
                    pitch?.let { "${signed(it.cents)} cents · ${if (inTune) "centered" else if (it.cents < 0) "flat" else "sharp"}" } ?: "±$tolerance cents target",
                    color = if (inTune) BocalCyan else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        if (listening) {
                            engine.stop(); listening = false
                        } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            listening = engine.start()
                        } else {
                            launcher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                ) { Text(if (listening) "Stop listening" else "Start listening") }
            }
        }

        Card {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Pitch trace", fontWeight = FontWeight.Bold)
                PitchTrace(centsTrace)
                Text("Confidence ${pitch?.let { "${(it.confidence * 100).roundToInt()}%" } ?: "—"}. Color is never the only status cue.", style = MaterialTheme.typography.bodySmall)
            }
        }

        SettingSlider("Reference pitch", a4, 430f..450f, "${a4.roundToInt()} Hz") { a4 = it }
        SettingSlider("In-tune window", tolerance, 2f..25f, "±${tolerance.roundToInt()} cents") { tolerance = it }
        Text("Pitch detection is a clean-room YIN-style reference implementation. Production release requires device-latency and instrument-range testing.", style = MaterialTheme.typography.bodySmall)
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
    Canvas(Modifier.fillMaxWidth().height(100.dp)) {
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
    Card {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label, fontWeight = FontWeight.Bold); Text(output)
            }
            Slider(value = value, onValueChange = onValue, valueRange = range)
        }
    }
}

@Composable
private fun LabScreen() {
    val context = LocalContext.current
    val loader = remember {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
    }
    Column(Modifier.fillMaxSize()) {
        Text(
            "35 local models · alto sax has note-to-key mapping; other woodwinds are part/key exploration pending specialist validation.",
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.bodySmall,
        )
        AndroidView(
            modifier = Modifier.fillMaxWidth().weight(1f),
            factory = { webContext ->
                WebView(webContext).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.mediaPlaybackRequiresUserGesture = true
                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse? =
                            loader.shouldInterceptRequest(request.url)

                        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                            view?.destroy()
                            return true
                        }
                    }
                    loadUrl("https://appassets.androidplatform.net/assets/www/index.html#lab")
                }
            },
            update = { if (it.url == null) it.loadUrl("https://appassets.androidplatform.net/assets/www/index.html#lab") },
            onRelease = { it.destroy() },
        )
    }
}

@Composable
private fun PulseScreen() {
    val context = LocalContext.current
    var bpm by remember { mutableIntStateOf(92) }
    var beats by remember { mutableIntStateOf(4) }
    var subdivisions by remember { mutableIntStateOf(1) }
    var activeBeat by remember { mutableIntStateOf(-1) }
    var running by remember { mutableStateOf(false) }
    var haptics by remember { mutableStateOf(true) }
    val taps = remember { mutableStateListOf<Long>() }
    val engine = remember {
        MetronomeEngine { beat ->
            activeBeat = beat
            if (haptics) vibrate(context, beat == 0)
        }
    }
    DisposableEffect(Unit) { onDispose { engine.close() } }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Pulse without clutter", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(bpm.toString(), fontSize = 74.sp, fontWeight = FontWeight.Black)
        Text("beats per minute")
        Slider(value = bpm.toFloat(), onValueChange = { bpm = it.roundToInt() }, valueRange = 30f..260f)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { bpm = (bpm - 1).coerceAtLeast(30) }) { Text("− 1") }
            OutlinedButton(onClick = {
                val now = System.currentTimeMillis()
                if (taps.isNotEmpty() && now - taps.last() > 2_400) taps.clear()
                taps.add(now); if (taps.size > 7) taps.removeAt(0)
                if (taps.size > 1) bpm = (60_000.0 * (taps.size - 1) / (taps.last() - taps.first())).roundToInt().coerceIn(30, 260)
            }) { Text("Tap tempo") }
            OutlinedButton(onClick = { bpm = (bpm + 1).coerceAtMost(260) }) { Text("+ 1") }
        }
        Text("Meter", fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(2, 3, 4, 5, 6, 7).forEach { count ->
                FilterChip(selected = beats == count, onClick = { beats = count }, label = { Text("$count/4") })
            }
        }
        Text("Subdivision", fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (1..4).forEach { count -> FilterChip(selected = subdivisions == count, onClick = { subdivisions = count }, label = { Text("×$count") }) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            repeat(beats) { index ->
                Box(
                    Modifier.size(if (index == 0) 42.dp else 34.dp).clip(CircleShape)
                        .background(if (index == activeBeat) BocalCyan else MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) { Text((index + 1).toString(), color = if (index == activeBeat) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        FilterChip(selected = haptics, onClick = { haptics = !haptics }, label = { Text(if (haptics) "Haptics on" else "Haptics off") })
        Button(
            onClick = {
                if (running) engine.stop() else engine.start(bpm, beats, subdivisions)
                running = !running; if (!running) activeBeat = -1
            },
            colors = ButtonDefaults.buttonColors(containerColor = if (running) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
        ) { Text(if (running) "Stop pulse" else "Start pulse") }
        Text("Reference implementation: steady scheduling, accents and subdivisions. Preset sequences, polyrhythm, random silence and Ableton Link are parity backlog items.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ToneScreen() {
    var octave by remember { mutableIntStateOf(4) }
    var playing by remember { mutableStateOf<Int?>(null) }
    var waveform by remember { mutableStateOf(ReferenceToneEngine.Waveform.SINE) }
    var a4 by remember { mutableStateOf(440f) }
    val engine = remember { ReferenceToneEngine() }
    DisposableEffect(Unit) { onDispose { engine.close() } }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Reference tone", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (2..6).forEach { value -> FilterChip(selected = octave == value, onClick = { octave = value }, label = { Text("Oct $value") }) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            noteNames.forEachIndexed { pitchClass, name ->
                val midi = (octave + 1) * 12 + pitchClass
                OutlinedButton(onClick = {
                    if (playing == midi) { engine.stop(); playing = null }
                    else { engine.play(a4 * Math.pow(2.0, (midi - 69) / 12.0).toFloat(), waveform); playing = midi }
                }) { Text(if (playing == midi) "■ $name" else name) }
            }
        }
        Text("Waveform", fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ReferenceToneEngine.Waveform.entries.forEach { value -> FilterChip(selected = waveform == value, onClick = { waveform = value }, label = { Text(value.name.lowercase().replaceFirstChar(Char::uppercase)) }) }
        }
        SettingSlider("Reference A", a4, 430f..450f, "${a4.roundToInt()} Hz") { a4 = it }
        Button(onClick = { engine.stop(); playing = null }) { Text("Stop all tones") }
        Text("The standalone web build adds a two-octave keyboard and equal, just-major and Pythagorean temperament examples.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun AnalyzeScreen() {
    val context = LocalContext.current
    var result by remember { mutableStateOf<YinPitchDetector.Result?>(null) }
    var running by remember { mutableStateOf(false) }
    val engine = remember { TunerEngine { result = it } }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) running = engine.start() }
    DisposableEffect(Unit) { onDispose { engine.close() } }
    val pitch = pitchUi(result, 440f, 0)

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Tone snapshot", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("A compact live diagnostic: stable pitch first, then tone color. This screen deliberately avoids pretending one number is a complete tone grade.")
        Card {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Metric("Detected pitch", pitch?.let { "${it.note}${it.octave}" } ?: "—")
                Metric("Frequency", pitch?.let { "${it.frequency.format(1)} Hz" } ?: "—")
                Metric("Pitch confidence", pitch?.let { "${(it.confidence * 100).roundToInt()}%" } ?: "—")
                Metric("Centering", pitch?.let { "${signed(it.cents)} cents" } ?: "—")
            }
        }
        Button(onClick = {
            if (running) { engine.stop(); running = false }
            else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) running = engine.start()
            else launcher.launch(Manifest.permission.RECORD_AUDIO)
        }) { Text(if (running) "Stop snapshot" else "Start snapshot") }
        Text("Full parity target: waveform, spectral/harmonic view, staff history, interval trainer, note transitions, vibrato and attack/release markers. The web reference demonstrates the first four visual primitives; native DSP validation remains open.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label); Text(value, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PracticeScreen() {
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

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Practice with evidence", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(formatDuration(elapsed), fontSize = 58.sp, fontWeight = FontWeight.Black)
                Button(onClick = {
                    if (startedAt == 0L) {
                        startedAt = System.currentTimeMillis(); elapsed = 0
                    } else {
                        store.addSession(PracticeSession(Instant.ofEpochMilli(startedAt).toString(), elapsed, "Alto saxophone", null))
                        startedAt = 0; elapsed = 0; sessions = store.sessions()
                    }
                }) { Text(if (startedAt == 0L) "Start practice" else "Finish and save") }
            }
        }
        Text("Today’s focus", fontWeight = FontWeight.Bold)
        listOf("8 min · Long tones: center, hold, release", "10 min · D major with a drone", "12 min · Loop the hardest four bars").forEach { item ->
            Card { Text(item, Modifier.fillMaxWidth().padding(14.dp)) }
        }
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Teacher or lesson note") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
        Button(onClick = { store.saveLessonNote(note) }) { Text("Save note on device") }
        HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Recent sessions", fontWeight = FontWeight.Bold)
            TextButton(onClick = { shareSessions(context, sessions) }) { Text("Export") }
        }
        if (sessions.isEmpty()) Text("No completed sessions on this device yet.")
        sessions.take(8).forEach { session ->
            Card {
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column { Text(session.instrument, fontWeight = FontWeight.Bold); Text(session.startedAt.take(10), style = MaterialTheme.typography.bodySmall) }
                    Text(formatDuration(session.seconds), fontWeight = FontWeight.Bold)
                }
            }
        }
        Text("All practice data in this reference stays on the device. Production work should add Room migrations, encrypted backup controls and a documented deletion/export policy.", style = MaterialTheme.typography.bodySmall)
    }
}

private fun shareSessions(context: Context, sessions: List<PracticeSession>) {
    val array = JSONArray()
    sessions.forEach { session ->
        array.put(JSONObject().put("startedAt", session.startedAt).put("seconds", session.seconds).put("instrument", session.instrument).put("inTunePercent", session.inTunePercent ?: JSONObject.NULL))
    }
    val payload = JSONObject().put("schemaVersion", 1).put("exportedAt", Instant.now()).put("sessions", array).toString(2)
    val intent = Intent(Intent.ACTION_SEND).apply { type = "application/json"; putExtra(Intent.EXTRA_TEXT, payload) }
    context.startActivity(Intent.createChooser(intent, "Export Bocal practice data"))
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

private fun Float.format(decimals: Int): String = "%.${decimals}f".format(this)
private fun signed(value: Float): String = if (value >= 0) "+${value.format(1)}" else value.format(1)
private fun formatDuration(seconds: Int): String = "%02d:%02d".format(seconds / 60, seconds % 60)
