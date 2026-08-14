package com.bocal.music.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val BocalViolet = Color(0xFF9F86FF)
val BocalCyan = Color(0xFF19ECD1)
val BocalGold = Color(0xFFC89134)
val BocalInk = Color(0xFF070809)
val BocalSurface = Color(0xFF101114)

private val BocalDarkColors = darkColorScheme(
    primary = BocalCyan,
    onPrimary = Color(0xFF04231E),
    secondary = BocalViolet,
    onSecondary = Color(0xFF17102D),
    tertiary = BocalGold,
    onTertiary = Color(0xFF241803),
    background = BocalInk,
    onBackground = Color(0xFFF5F6F7),
    surface = BocalSurface,
    onSurface = Color(0xFFF5F6F7),
    surfaceVariant = Color(0xFF17181C),
    onSurfaceVariant = Color(0xFFA6A8AF),
    outline = Color(0xFF303239),
)

@Composable
fun BocalTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = BocalDarkColors, content = content)
}
