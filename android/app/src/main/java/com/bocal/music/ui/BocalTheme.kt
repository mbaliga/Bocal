package com.bocal.music.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val BocalViolet = Color(0xFF9B8CFF)
val BocalCyan = Color(0xFF39E8CF)
val BocalInk = Color(0xFF171820)
val BocalSurface = Color(0xFF20212A)
val BocalPaper = Color(0xFFF6F5FA)

private val DarkColors = darkColorScheme(
    primary = BocalViolet,
    onPrimary = Color(0xFF121219),
    secondary = BocalCyan,
    onSecondary = Color(0xFF071B18),
    background = Color(0xFF111218),
    onBackground = Color(0xFFF4F2FA),
    surface = BocalSurface,
    onSurface = Color(0xFFF4F2FA),
    surfaceVariant = Color(0xFF2A2B35),
    onSurfaceVariant = Color(0xFFCBC8D4),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF5948C7),
    onPrimary = Color.White,
    secondary = Color(0xFF006B5D),
    onSecondary = Color.White,
    background = BocalPaper,
    onBackground = BocalInk,
    surface = Color.White,
    onSurface = BocalInk,
    surfaceVariant = Color(0xFFE9E7F0),
    onSurfaceVariant = Color(0xFF45434C),
)

@Composable
fun BocalTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
