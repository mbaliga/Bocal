# Bocal native Android

Bocal 0.2.0 is a native Kotlin and Jetpack Compose app, not a WebView wrapper. It targets Android 16 / API 36 and keeps its learning and practice data on the device.

## Included in 0.2.0

- confidence-gated native microphone tuner with written and concert pitch;
- E♭ alto saxophone and concert-pitch oboe transposition profiles;
- bundled, licensed alto saxophone GLB rendered in OpenGL ES 2 with a uniform bronze study finish;
- full written B♭3–F♯6 alto fingering dataset, important alternate routes and key-aligned cyan glows;
- no hand or body overlays;
- four-step cinematic onboarding;
- curved bottom navigation in portrait and a left/right selectable curved edge dock in landscape;
- native pulse control, pitch trace and device audio-capability view;
- persisted local practice timer, focus notes and recent-session history;
- lifecycle and audio-focus handling that releases the microphone when Bocal is backgrounded or interrupted;
- no `INTERNET` permission.

The app uses a small in-repository binary glTF loader tailored to the optimized alto asset. It keeps the source mesh geometry and shades body/keywork roles at runtime. This is an educational renderer, not a CAD viewer or a per-key mechanical rig.

## Build and checks

Requirements:

- JDK 17;
- Android SDK platform 36;
- Android Build Tools 36.0.0;
- Gradle 8.13 (wrapper included);
- Android Gradle Plugin 8.13.2.

From this directory:

```text
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebug
./gradlew :app:assembleDebugAndroidTest
```

The installable output is `app/build/outputs/apk/debug/app-debug.apk`. Versioned engineering binaries are committed under the repository’s `debug-apks/` directory; `latest-debug-apk.txt` selects the website download copy.

## Physical-device verification

Run `scripts/run-physical-device-checks.sh` with exactly one authorized physical Android device attached. The script installs the APK, runs the instrumentation suite and records device evidence under the ignored `android/device-results/` directory.

Acoustic pitch accuracy and input-to-display latency still require an external tone source or loopback measurement. Follow `PHYSICAL_DEVICE_TEST_PLAN.md`; do not convert desktop DSP tests or Android capability flags into a made-up latency result.

## Release boundary

The committed APK is debug-signed. It is for sideloading and engineering QA, not Play Store distribution. A production release still needs representative device results, expert review of the saxophone key anchors, a private release keystore and Play delivery configuration. Never commit the release keystore.
