package com.bocal.music.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BocalColors = darkColorScheme(
    primary = Color(0xFF08FED5),
    onPrimary = Color(0xFF06201C),
    secondary = Color(0xFF8E7BFF),
    background = Color(0xFF060607),
    onBackground = Color(0xFFF5F3EB),
    surface = Color(0xFF101011),
    onSurface = Color(0xFFF5F3EB),
    surfaceVariant = Color(0xFF19191C),
    outline = Color(0xFF34343A),
    error = Color(0xFFE69F00),
)

@Composable
fun BocalTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = BocalColors, content = content)
}
