package com.bocal.music.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bocal.music.data.NavigationSide

enum class AppSection(val label: String, val glyph: String) {
    TUNE("Tune", "◎"),
    LAB("3D lab", "≋"),
    PULSE("Pulse", "≈"),
    ANALYZE("Analyze", "⌁"),
    PRACTICE("Practice", "♪"),
}

@Composable
fun ArcNavigation(
    selected: AppSection,
    onSelect: (AppSection) -> Unit,
    vertical: Boolean,
    side: NavigationSide,
    modifier: Modifier = Modifier,
) {
    val background = Brush.linearGradient(listOf(Color(0xF7111214), Color(0xEF202126)))
    val shape = if (vertical) {
        if (side == NavigationSide.LEFT) {
            RoundedCornerShape(topStart = 30.dp, bottomStart = 30.dp, topEnd = 52.dp, bottomEnd = 52.dp)
        } else {
            RoundedCornerShape(topStart = 52.dp, bottomStart = 52.dp, topEnd = 30.dp, bottomEnd = 30.dp)
        }
    } else RoundedCornerShape(topStart = 40.dp, topEnd = 40.dp, bottomStart = 24.dp, bottomEnd = 24.dp)

    if (vertical) {
        Column(
            modifier
                .fillMaxHeight()
                .padding(vertical = 10.dp, horizontal = 7.dp)
                .background(background, shape)
                .border(1.dp, Color(0xFF3B3C43), shape)
                .padding(vertical = 10.dp, horizontal = 7.dp),
            verticalArrangement = Arrangement.SpaceEvenly,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AppSection.entries.forEachIndexed { index, section ->
                val arc = when (index) {
                    1, 3 -> 5.dp
                    2 -> 10.dp
                    else -> 0.dp
                }
                val direction = if (side == NavigationSide.LEFT) 1 else -1
                NavigationButton(
                    section = section,
                    selected = section == selected,
                    onClick = { onSelect(section) },
                    xOffset = arc * direction,
                    yOffset = 0.dp,
                    showLabel = section == selected,
                )
            }
        }
    } else {
        Row(
            modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 7.dp)
                .background(background, shape)
                .border(1.dp, Color(0xFF3B3C43), shape)
                .padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppSection.entries.forEachIndexed { index, section ->
                val arc = when (index) {
                    1, 3 -> (-4).dp
                    2 -> (-9).dp
                    else -> 0.dp
                }
                NavigationButton(
                    section = section,
                    selected = section == selected,
                    onClick = { onSelect(section) },
                    xOffset = 0.dp,
                    yOffset = arc,
                    showLabel = true,
                )
            }
        }
    }
}

@Composable
private fun NavigationButton(
    section: AppSection,
    selected: Boolean,
    onClick: () -> Unit,
    xOffset: Dp,
    yOffset: Dp,
    showLabel: Boolean,
) {
    val animatedX by animateDpAsState(xOffset + if (selected && xOffset != 0.dp) xOffset / 2 else 0.dp, label = "nav-x")
    val animatedY by animateDpAsState(yOffset + if (selected && yOffset != 0.dp) (-3).dp else 0.dp, label = "nav-y")
    val colour by animateColorAsState(if (selected) Cyan else Color(0xFF7C7C81), label = "nav-colour")
    Column(
        Modifier
            .offset(animatedX, animatedY)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics {
                this.selected = selected
                this.role = Role.Tab
                this.contentDescription = section.label
            }
            .padding(horizontal = 5.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(if (selected) 44.dp else 38.dp)
                .background(
                    if (selected) Brush.radialGradient(listOf(Color(0xFF24564C), Color(0xFF12231F))) else Brush.radialGradient(listOf(Color.Transparent, Color.Transparent)),
                    CircleShape,
                )
                .border(if (selected) 1.dp else 0.dp, if (selected) Color(0xFF397A6F) else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(section.glyph, color = colour, fontSize = 19.sp, fontWeight = FontWeight.Medium)
        }
        if (showLabel) Text(section.label, color = colour, fontSize = 8.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
    }
}
