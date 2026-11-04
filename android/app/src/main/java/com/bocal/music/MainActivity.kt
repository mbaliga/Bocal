package com.bocal.music

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.bocal.music.ui.WebAppScreen
import com.bocal.music.widget.HostOpenRequests

class MainActivity : ComponentActivity() {
    /** Where a home-screen widget tap asked to land, until the page takes it. */
    private val openRequests = HostOpenRequests()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // A recreated activity has already handled its launch intent.
        if (savedInstanceState == null) openRequests.offer(intent?.getStringExtra(HostOpenRequests.EXTRA_OPEN))
        setContent {
            WebAppScreen(openRequests)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openRequests.offer(intent.getStringExtra(HostOpenRequests.EXTRA_OPEN))
    }
}
