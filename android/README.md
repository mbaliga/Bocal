# Bocal Android reference app

This is the native Android source used for the Bocal handoff. It is a Kotlin/Jetpack Compose project with a native microphone tuner, metronome, reference-tone generator, tone snapshot, local practice journal, and a local WebView shell for the interactive 3D laboratory. The 3D HTML, JavaScript bundle, catalog, and 35 GLB files are packaged under `app/src/main/assets/www`; the app declares no `INTERNET` permission.

## Honest release status

This environment did not contain the Android SDK, Build Tools, `aapt2`, Gradle, or an existing Gradle wrapper JAR. I therefore could not compile, sign, install, or device-test an APK here. No dummy or renamed archive is supplied as an APK.

The source is designed for the current documented toolchain as of 10 August 2026:

- Android Studio with JDK 17
- Android SDK Platform 36 and Build Tools 36.0.0
- Android Gradle Plugin 9.3.0 and Gradle 9.5.0
- built-in Kotlin plus Compose compiler plugin 2.3.21
- min SDK 26; target SDK 36

## Build a debug APK

1. Open this `android` folder in Android Studio.
2. Let Android Studio install Platform 36, Build Tools 36.0.0, and Gradle 9.5.0 when prompted.
3. Use **Build > Build APK(s)**, or run `./build-apk.sh` after the IDE has generated/downloaded the wrapper.
4. Find the result at `app/build/outputs/apk/debug/app-debug.apk`.
5. Run `./verify-apk.sh app/build/outputs/apk/debug/app-debug.apk` to verify that the file is a real ZIP/APK and inspect its manifest if `apkanalyzer` is installed.

For a Play release, create a private signing key outside the repository, configure signing via local environment/Gradle properties, run the unit tests, and produce an AAB with `:app:bundleRelease`. Never commit the keystore or passwords.

## Test checklist before distribution

- `:app:testDebugUnitTest` passes (including 440 Hz and silence cases).
- Microphone denial and later grant both recover cleanly.
- Tune on at least a low-, mid-, and high-latency Android device; record measured callback latency rather than assuming it.
- Validate saxophone fundamentals, overtones, vibrato, altissimo, noisy rooms, and phone cases that occlude microphones.
- Check metronome drift over 30 minutes and behavior across audio focus changes.
- Inspect all models on a small phone, tablet, and TalkBack; verify every status has text/shape as well as color.
- Confirm the WebView performs no network requests and all 35 models load from app assets.
- Conduct fingering review with instrument specialists before enabling note-level lessons for any model beyond the alto sax core chart.

## Architecture boundary

The native UI is deliberately small and task-first. Microphone and time-critical interactions are native. The local WebView is used only as a portable renderer for the Three.js/glTF learning lab. A production build can replace that layer with Filament without changing the `catalog.json` or named-control conventions.

This source is a verifiable engineering reference, not a claim of finished TonalEnergy parity. See the product handoff and parity matrix for the remaining program.
