# Bocal Android APK build status

Version: 0.5.0
Date: 2026-08-14

**A debug APK now builds.** The source compiles, unit tests pass and lint is clean.
This supersedes the previous status, which recorded that no environment with an
Android SDK had ever been available to try.

## What was verified

```
gradle --no-daemon clean assembleDebug testDebugUnitTest lintDebug   # BUILD SUCCESSFUL
./verify-apk.sh app/build/outputs/apk/debug/app-debug.apk            # APK container valid
./static-check.sh                                                    # PASS, end to end
```

Toolchain used: Android SDK Platform 37.0 and Build-Tools 36.0.0, Gradle 9.5.0,
AGP 9.3.0, JDK 21. Artifact: `app/build/outputs/apk/debug/app-debug.apk`, ~25.9 MB.

APK contents confirmed by inspection: `RECORD_AUDIO` and `VIBRATE` are the only
declared permissions, `INTERNET` is absent, and the bundled assets are the sax and
Howarth oboe glTF models only.

## Three source fixes were required

None of these could have been caught without a real compile:

1. `BocalApp.kt` imported `androidx.compose.foundation.layout.weight`. `weight` is a
   `RowScope`/`ColumnScope` member, so the import resolved to an internal
   `RowColumnParentData?.weight` property and failed compilation. Removed; the
   scope-provided `Modifier.weight()` needs no import.
2. `androidx.core:core-ktx:1.19.0` requires compiling against API 37, but the project
   pinned `compileSdk = 36`, so AAR metadata validation failed. `compileSdk` is now 37.
   `targetSdk` stays 36 and `minSdk` stays 26.
3. `themes.xml` set `android:windowLightNavigationBar`, which is API 27, while
   `minSdk` is 26 — a lint `NewApi` error. The attribute moved to
   `values-v27/themes.xml`, with the base theme split out as `Theme.Bocal.Base`.

## Still required for a release build

The debug APK is signed with the standard Android debug key
(`CN=Android Debug`). It is installable for testing and is **not** a distributable
release artifact.

- Release signing with a real keystore. The key identity is permanent for Play Store
  distribution, so it is a deliberate decision, not a build step to automate.
- `./gradlew connectedDebugAndroidTest` — the instrumentation suite has never run;
  it needs an emulator or attached device.
- `./device-release-check.sh` — install, cold launch and permission smoke testing on
  a real target.
- The manual physical-device gates in `RELEASE_HARDENING_REPORT_0.4.1.md`, including
  microphone accuracy, metronome drift, WebGL rendering and battery/thermal behavior.
