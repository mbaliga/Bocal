package com.bocal.music.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bocal.music.MIN_WEBVIEW_MAJOR

/** The WebView provider itself, so "update WebView" can point straight at it. */
private const val WEBVIEW_PACKAGE_NAME = "com.google.android.webview"

/**
 * Shown instead of the app's WebView when [com.bocal.music.webViewMeetsFloor]
 * says no -- an outdated Android System WebView, not the app, is the
 * problem, and this screen says so plainly and offers a way out. Nothing
 * here needs the network directly (opening the Play Store is an external
 * intent), so the app adds no `INTERNET` permission for it.
 */
@Composable
fun WebViewUpdateScreen(detectedVersion: String?, onTryAgain: () -> Unit) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF070809))
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(32.dp)
            .semantics { contentDescription = "Bocal needs a WebView update" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Bocal needs a newer WebView",
            color = Color.White,
            fontSize = 22.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "Bocal needs Android System WebView $MIN_WEBVIEW_MAJOR or newer to run. " +
                if (detectedVersion.isNullOrBlank()) {
                    "This device didn't report a WebView version."
                } else {
                    "This device has version $detectedVersion."
                },
            color = Color(0xFFC7C7C7),
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))
        Button(onClick = { openWebViewListing(context) }) {
            Text("Update WebView")
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onTryAgain) {
            Text("Try again")
        }
    }
}

private fun openWebViewListing(context: Context) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$WEBVIEW_PACKAGE_NAME")))
        return
    } catch (_: ActivityNotFoundException) {
        // No Play Store app installed; fall through to the web listing.
    }
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$WEBVIEW_PACKAGE_NAME")),
        )
    } catch (_: ActivityNotFoundException) {
        // No browser either. Nothing more we can do without adding a
        // permission this screen has no other reason to need.
    }
}
