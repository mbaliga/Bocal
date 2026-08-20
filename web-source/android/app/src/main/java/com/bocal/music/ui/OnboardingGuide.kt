package com.bocal.music.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bocal.music.R

@Composable
fun OnboardingGuide(onFinish: () -> Unit) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF060607))
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("≋  bocal", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Button(
                onClick = onFinish,
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = MutedText),
            ) { Text("Skip guide", fontSize = 10.sp) }
        }
        Row(Modifier.align(Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(4) { index ->
                Box(
                    Modifier
                        .width(if (index == step) 38.dp else 20.dp)
                        .height(4.dp)
                        .background(if (index <= step) Brush.horizontalGradient(listOf(Violet, Cyan)) else Brush.linearGradient(listOf(Color(0xFF303036), Color(0xFF303036))), CircleShape),
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when (step) {
                0 -> InstrumentStep()
                1 -> TunerStep()
                2 -> LearningStep()
                else -> LocalPracticeStep()
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Button(
                onClick = { step = (step - 1).coerceAtLeast(0) },
                enabled = step > 0,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF18191D)),
                shape = RoundedCornerShape(15.dp),
            ) { Text("Back") }
            Button(
                onClick = { if (step == 3) onFinish() else step += 1 },
                shape = RoundedCornerShape(15.dp),
            ) { Text(if (step == 3) "Enter Bocal" else "Continue", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun InstrumentStep() {
    val instruments = listOf(
        InstrumentVisual("Alto saxophone", "E♭ · native 3D lab", R.drawable.bocal_alto_sax_cinematic, true),
        InstrumentVisual("Tenor saxophone", "Model sourcing", R.drawable.bocal_tenor_sax_cinematic),
        InstrumentVisual("Soprano saxophone", "Model sourcing", R.drawable.bocal_soprano_sax_cinematic),
        InstrumentVisual("Clarinet", "Licence blocked", R.drawable.bocal_clarinet_cinematic),
        InstrumentVisual("Flute", "Player review", R.drawable.bocal_flute_cinematic),
        InstrumentVisual("Oboe", "Anatomy preview", R.drawable.bocal_oboe_cinematic),
        InstrumentVisual("Bassoon", "Model sourcing", R.drawable.bocal_bassoon_cinematic),
    )
    Column(Modifier.fillMaxSize()) {
        Text("FIRST THINGS FIRST", color = Cyan, fontSize = 10.sp, letterSpacing = 1.8.sp)
        Text("Pick the instrument you’re playing.", fontSize = 38.sp, lineHeight = 42.sp, fontWeight = FontWeight.SemiBold)
        Text("Alto saxophone is the complete native learning path in this build.", color = MutedText, fontSize = 12.sp)
        Spacer(Modifier.height(16.dp))
        Row(
            Modifier.fillMaxSize().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            instruments.forEach { instrument -> InstrumentCard(instrument) }
        }
    }
}

@Composable
private fun InstrumentCard(instrument: InstrumentVisual) {
    Box(
        Modifier
            .width(if (instrument.current) 250.dp else 126.dp)
            .fillMaxHeight()
            .clip(RoundedCornerShape(24.dp))
            .border(1.dp, if (instrument.current) Color(0xFF258C7C) else Color(0xFF303137), RoundedCornerShape(24.dp)),
    ) {
        Image(
            painter = painterResource(instrument.image),
            contentDescription = instrument.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xEC050607)), startY = 180f)))
        Column(Modifier.align(Alignment.BottomStart).padding(15.dp)) {
            if (instrument.current) Text("CURRENT", color = Cyan, fontSize = 8.sp, letterSpacing = 1.3.sp)
            Text(instrument.name, fontSize = if (instrument.current) 23.sp else 14.sp, fontWeight = FontWeight.Bold)
            Text(instrument.status, color = if (instrument.current) Cyan else Color(0xFFAAA8A2), fontSize = 8.sp)
        }
    }
}

@Composable
private fun TunerStep() {
    GuidedStep(
        eyebrow = "TUNE",
        title = "Play one steady note.",
        copy = "Bocal waits for a stable pitch. Silence stays blank, and written pitch remains separate from concert pitch.",
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.radialGradient(listOf(Color(0xFF211D46), Color(0xFF101114))), RoundedCornerShape(26.dp))
                .border(1.dp, Color(0xFF34343A), RoundedCornerShape(26.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("CENTERED", color = Cyan, fontSize = 10.sp, letterSpacing = 2.sp)
                Text("A⁴", fontSize = 94.sp, fontWeight = FontWeight.Medium)
                Box(Modifier.fillMaxWidth(0.7f).height(3.dp).background(Color(0xFF43434A))) {
                    Box(Modifier.align(Alignment.Center).width(22.dp).height(3.dp).background(Cyan))
                }
                Text("0 cents · 440.0 Hz", color = MutedText, fontSize = 10.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
}

@Composable
private fun LearningStep() {
    GuidedStep(
        eyebrow = "LEARN",
        title = "Watch the right keys light up.",
        copy = "No fake hands. Cyan glows mark the exact controls for the selected written note; drag the bronze saxophone to inspect either side.",
    ) {
        BronzeSaxModel(activeKeys = setOf("lh1", "lh2"), showAvailable = false, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun LocalPracticeStep() {
    GuidedStep(
        eyebrow = "PRACTICE",
        title = "Your work stays on your device.",
        copy = "Save focused sessions and notes without an account. Microphone audio is processed locally and is never uploaded.",
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF101114), RoundedCornerShape(26.dp))
                .border(1.dp, Color(0xFF34343A), RoundedCornerShape(26.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            PrivacyCard("◎", "Tune", "Steady pitch readings")
            Spacer(Modifier.height(9.dp))
            PrivacyCard("♪", "Practice", "Session time and notes")
            Spacer(Modifier.height(9.dp))
            PrivacyCard("♬", "Learn", "Selected notes and fingerings")
            Spacer(Modifier.height(17.dp))
            Text("Nothing leaves your device.", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun GuidedStep(eyebrow: String, title: String, copy: String, visual: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val landscape = maxWidth > maxHeight
        if (landscape) {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(0.72f).fillMaxHeight(), verticalArrangement = Arrangement.Center) {
                    GuideCopy(eyebrow, title, copy)
                }
                Box(Modifier.weight(1.28f).fillMaxHeight()) { visual() }
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                GuideCopy(eyebrow, title, copy)
                Spacer(Modifier.height(14.dp))
                Box(Modifier.fillMaxWidth().weight(1f)) { visual() }
            }
        }
    }
}

@Composable
private fun GuideCopy(eyebrow: String, title: String, copy: String) {
    Text(eyebrow, color = Cyan, fontSize = 10.sp, letterSpacing = 1.8.sp)
    Text(title, fontSize = 36.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold)
    Text(copy, color = MutedText, fontSize = 13.sp, lineHeight = 19.sp)
}

@Composable
private fun PrivacyCard(glyph: String, title: String, copy: String) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF18191D), RoundedCornerShape(17.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).background(Color(0xFF28234F), RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
            Text(glyph, color = Violet)
        }
        Column {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Text(copy, color = MutedText, fontSize = 9.sp)
        }
    }
}

private data class InstrumentVisual(
    val name: String,
    val status: String,
    @param:DrawableRes val image: Int,
    val current: Boolean = false,
)
