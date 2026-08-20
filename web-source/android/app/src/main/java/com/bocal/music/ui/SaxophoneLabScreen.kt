package com.bocal.music.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.bocal.music.data.SaxFingering
import com.bocal.music.data.SaxophoneData
import com.bocal.music.graphics.ModelStatus
import com.bocal.music.graphics.SaxophoneGlSurfaceView

@Composable
fun SaxophoneLabScreen() {
    var selectedFingeringIndex by rememberSaveable { mutableIntStateOf(11) }
    var selectedRouteIndex by rememberSaveable { mutableIntStateOf(0) }
    var showAvailable by rememberSaveable { mutableStateOf(false) }
    val fingering = SaxophoneData.fingerings[selectedFingeringIndex]
    LaunchedEffect(selectedFingeringIndex) { selectedRouteIndex = 0 }
    val route = fingering.routes[selectedRouteIndex.coerceAtMost(fingering.routes.lastIndex)]

    Column(Modifier.fillMaxSize()) {
        Text("3D LAB", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, letterSpacing = 2.sp)
        Text("See the mechanism.", fontSize = 38.sp, fontWeight = FontWeight.SemiBold)
        Text("Choose a written note. Only the keys you press glow cyan.", color = MutedText, fontSize = 13.sp)
        Spacer(Modifier.height(14.dp))
        NoteStrip(selectedFingeringIndex) { selectedFingeringIndex = it }
        Spacer(Modifier.height(12.dp))

        BoxWithConstraints(Modifier.fillMaxSize()) {
            val landscape = maxWidth > maxHeight
            if (landscape) {
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    BronzeSaxModel(
                        activeKeys = route.keys.toSet(),
                        showAvailable = showAvailable,
                        modifier = Modifier.weight(1.35f).fillMaxHeight(),
                    )
                    FingeringPanel(
                        fingering = fingering,
                        selectedRoute = selectedRouteIndex,
                        showAvailable = showAvailable,
                        onRouteChange = { selectedRouteIndex = it },
                        onShowAvailable = { showAvailable = it },
                        modifier = Modifier.weight(0.78f).fillMaxHeight(),
                    )
                }
            } else {
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    BronzeSaxModel(
                        activeKeys = route.keys.toSet(),
                        showAvailable = showAvailable,
                        modifier = Modifier.fillMaxWidth().weight(1.15f),
                    )
                    FingeringPanel(
                        fingering = fingering,
                        selectedRoute = selectedRouteIndex,
                        showAvailable = showAvailable,
                        onRouteChange = { selectedRouteIndex = it },
                        onShowAvailable = { showAvailable = it },
                        modifier = Modifier.fillMaxWidth().weight(0.85f),
                    )
                }
            }
        }
    }
}

@Composable
fun BronzeSaxModel(
    activeKeys: Set<String>,
    showAvailable: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var modelStatus by remember { mutableStateOf(ModelStatus.LOADING) }
    var modelView by remember { mutableStateOf<SaxophoneGlSurfaceView?>(null) }

    DisposableEffect(modelView, context) {
        val activity = context.findActivity()
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> modelView?.onResume()
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> modelView?.onPause()
                else -> Unit
            }
        }
        activity?.lifecycle?.addObserver(observer)
        if (activity?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true) modelView?.onResume()
        onDispose {
            activity?.lifecycle?.removeObserver(observer)
            modelView?.onPause()
        }
    }

    Box(
        modifier
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.radialGradient(
                    listOf(Color(0xFF51565B), Color(0xFF24272C), Color(0xFF090B0E)),
                    radius = 1_250f,
                ),
            )
            .border(1.dp, Color(0xFF34343A), RoundedCornerShape(24.dp)),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                SaxophoneGlSurfaceView(viewContext) { modelStatus = it }.also { modelView = it }
            },
            update = { view ->
                view.setActiveKeys(activeKeys)
                view.setShowAvailable(showAvailable)
            },
        )
        Surface(
            modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            color = Color(0xD9121316),
            shape = RoundedCornerShape(100.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF3C3D43)),
        ) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(if (modelStatus == ModelStatus.ERROR) Color(0xFFE69F00) else Cyan, CircleShape))
                Spacer(Modifier.size(7.dp))
                Text(
                    when (modelStatus) {
                        ModelStatus.LOADING -> "Loading bronze study"
                        ModelStatus.READY -> "Bronze study · drag to orbit"
                        ModelStatus.ERROR -> "Model could not load"
                    },
                    color = Color(0xFFD2D1CC),
                    fontSize = 9.sp,
                )
            }
        }
        Row(
            Modifier.align(Alignment.BottomStart).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LegendDot(Cyan, "Press")
            LegendDot(Bronze, "Available")
        }
        Button(
            onClick = { modelView?.resetCamera() },
            modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xD9121316)),
            shape = RoundedCornerShape(100.dp),
        ) { Text("Reset view", fontSize = 9.sp) }
    }
}

@Composable
private fun NoteStrip(selected: Int, onSelect: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        SaxophoneData.fingerings.forEachIndexed { index, fingering ->
            Button(
                onClick = { onSelect(index) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (index == selected) Cyan else Color(0xFF121316),
                    contentColor = if (index == selected) Color(0xFF04231E) else Color(0xFFA3A29E),
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.height(46.dp),
            ) { Text(fingering.writtenName, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
        }
    }
}

@Composable
private fun FingeringPanel(
    fingering: SaxFingering,
    selectedRoute: Int,
    showAvailable: Boolean,
    onRouteChange: (Int) -> Unit,
    onShowAvailable: (Boolean) -> Unit,
    modifier: Modifier,
) {
    val route = fingering.routes[selectedRoute.coerceAtMost(fingering.routes.lastIndex)]
    Column(
        modifier
            .clip(RoundedCornerShape(24.dp))
            .background(Color(0xFF101114))
            .border(1.dp, Color(0xFF303137), RoundedCornerShape(24.dp))
            .padding(18.dp),
    ) {
        Text(fingering.level.uppercase(), color = Violet, fontSize = 9.sp, letterSpacing = 1.5.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Column {
                Text(fingering.writtenName, fontSize = 52.sp, fontWeight = FontWeight.SemiBold)
                Text("written pitch", color = MutedText, fontSize = 10.sp)
            }
            Text("→  ${fingering.concertName}", color = Color(0xFFD8D6CF), fontSize = 25.sp, fontWeight = FontWeight.Medium)
        }
        if (fingering.routes.size > 1) {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                fingering.routes.forEachIndexed { index, item ->
                    Button(
                        onClick = { onRouteChange(index) },
                        colors = ButtonDefaults.buttonColors(containerColor = if (index == selectedRoute) Color(0xFF193B35) else Color(0xFF1B1B20)),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text(item.label, fontSize = 9.sp, color = if (index == selectedRoute) Cyan else Color(0xFFB5B3AC)) }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(route.hint, color = Color(0xFFD4D1C9), fontSize = 13.sp, lineHeight = 19.sp)
        route.useWhen?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = Violet, fontSize = 10.sp, lineHeight = 15.sp)
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("Show every touch", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                Text("Gold rings are reference points, not fingers.", color = MutedText, fontSize = 9.sp)
            }
            Switch(checked = showAvailable, onCheckedChange = onShowAvailable)
        }
        Spacer(Modifier.height(12.dp))
        Text("KEY CONTACTS", color = MutedText, fontSize = 9.sp, letterSpacing = 1.2.sp)
        Spacer(Modifier.height(7.dp))
        if (route.keys.isEmpty()) {
            Text("Open fingering — no key is pressed.", color = Color(0xFFB9B7B0), fontSize = 11.sp)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                route.keys.mapNotNull(SaxophoneData.keysById::get).forEach { key ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(key.name, color = Color(0xFFD0CEC7), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${key.hand} · ${key.finger}", color = MutedText, fontSize = 9.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Surface(color = Color(0xC9121316), shape = RoundedCornerShape(100.dp)) {
        Row(Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).background(color, CircleShape))
            Spacer(Modifier.size(5.dp))
            Text(label, color = Color(0xFFB7B5AF), fontSize = 8.sp)
        }
    }
}

internal val Cyan = Color(0xFF08FED5)
internal val Violet = Color(0xFF9A87FF)
internal val Bronze = Color(0xFFD7A94D)
internal val MutedText = Color(0xFF8A8987)

private tailrec fun Context.findActivity(): ComponentActivity? = when (this) {
    is ComponentActivity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
