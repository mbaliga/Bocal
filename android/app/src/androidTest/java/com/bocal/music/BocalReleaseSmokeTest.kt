package com.bocal.music

import android.Manifest
import android.content.pm.PackageManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.bocal.music.ui.BocalFileSaver
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Runtime shell checks. Passing on an emulator is not a physical audio sign-off. */
class BocalReleaseSmokeTest {
    @get:Rule val activityRule = ActivityScenarioRule(MainActivity::class.java)

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) {
            findWebView(view.getChildAt(i))?.let { return it }
        }
        return null
    }

    /**
     * evaluateJavascript callbacks can be dropped while Chromium is still
     * attaching the first renderer after a cold emulator boot. Treat one
     * missing callback as a transient readiness signal, not an immediate test
     * failure; the polling helpers below reacquire the current WebView and
     * retry until their overall deadline. Once the page is ready, every
     * mutating assertion still has to return true.
     */
    private fun evaluateOnce(script: String, callbackTimeoutSeconds: Long = 5): String? {
        var result: String? = null
        val latch = CountDownLatch(1)
        activityRule.scenario.onActivity { activity ->
            val view = findWebView(activity.window.decorView)
            if (view == null) {
                latch.countDown()
            } else {
                view.evaluateJavascript(script) { value ->
                    result = value
                    latch.countDown()
                }
            }
        }
        if (!latch.await(callbackTimeoutSeconds, TimeUnit.SECONDS)) return null
        return result
    }

    private fun awaitTrue(script: String, timeoutSeconds: Long = 30) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds)
        var attempts = 0
        var lastResult: String? = null
        do {
            attempts += 1
            lastResult = evaluateOnce(script)
            if (lastResult == "true") return
            Thread.sleep(100)
        } while (System.nanoTime() < deadline)
        fail("Timed out waiting for JavaScript after $attempts attempts (last result=$lastResult): $script")
    }

    private fun requireJavascriptTrue(script: String) = awaitTrue(script, timeoutSeconds = 15)

    private fun ready() = awaitTrue("document.querySelectorAll('.mobile-nav button').length === 5")

    @Test fun coldLaunchHasTrustedOriginBridgeAndNoPrematureMicrophonePermission() {
        ready()
        awaitTrue("location.origin === 'https://appassets.androidplatform.net' && typeof window.bocalHost.saveFile === 'function'")
        activityRule.scenario.onActivity { activity ->
            assertEquals(PackageManager.PERMISSION_DENIED, ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO))
            val view = findWebView(activity.window.decorView)!!
            assertFalse(view.settings.allowFileAccess)
            assertFalse(view.settings.allowContentAccess)
            assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, view.settings.mixedContentMode)
        }
    }

    @Test fun allWorkspacesMountInsideTheAndroidWebView() {
        ready()
        requireJavascriptTrue("localStorage.setItem('bocal-onboarding-v2','complete'); true")
        for (index in 0 until 5) {
            requireJavascriptTrue("document.querySelectorAll('.mobile-nav button')[$index].click(); true")
            awaitTrue("document.querySelectorAll('.mobile-nav button')[$index].getAttribute('aria-current') === 'page' && document.querySelector('main').innerText.trim().length > 80")
        }
    }

    @Test fun localStorageSurvivesActivityRecreation() {
        ready()
        requireJavascriptTrue("localStorage.setItem('bocal-release-smoke-sentinel','survives'); true")
        activityRule.scenario.recreate()
        ready()
        awaitTrue("localStorage.getItem('bocal-release-smoke-sentinel') === 'survives'")
        requireJavascriptTrue("localStorage.removeItem('bocal-release-smoke-sentinel'); true")
    }

    @Test fun systemBackClosesSettingsBeforeLeavingTheApp() {
        ready()
        requireJavascriptTrue("document.querySelector('[aria-label=\"Open Bocal settings\"]').click(); true")
        awaitTrue("document.querySelector('.download-overlay') !== null")
        pressBack()
        awaitTrue("document.querySelector('.download-overlay') === null")
        awaitTrue("document.querySelectorAll('.mobile-nav button').length === 5")
    }

    @Test fun exportNamesAndMimeTypesAreSanitised() {
        val name = BocalFileSaver.sanitizeName("../../bad:take.wav")
        assertFalse(name.contains('/'))
        assertFalse(name.contains(':'))
        assertTrue(name.endsWith(".wav"))
        assertEquals("audio/webm", BocalFileSaver.sanitizeMime("audio/webm;codecs=opus"))
        assertEquals("application/octet-stream", BocalFileSaver.sanitizeMime("not a mime"))
    }
}
