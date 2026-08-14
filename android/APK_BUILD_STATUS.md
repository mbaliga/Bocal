# Bocal Android APK build status

Version: 0.4.1-hardening
Date: 2026-08-13

**No verified APK is included.** This source has undergone release-hardening and local deterministic checks, but this execution environment has no Android SDK, Gradle runtime, adb target, emulator or physical device. Outbound shell DNS also prevents bootstrapping those missing tools.

What is ready:
- compileSdk/targetSdk 36, minSdk 26;
- Java/Kotlin target 17;
- AGP 9.3.0 / Gradle 9.5.0 wrapper target;
- unit-test fixtures and static integrity checks;
- Android instrumentation smoke tests;
- `verify-apk.sh` for APK structural verification;
- `device-release-check.sh` for real-target install/cold-launch/permission smoke testing;
- detailed sax and Howarth oboe assets with their model-truth boundaries preserved.

Required to produce the first verified APK:

```bash
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
./gradlew --no-daemon connectedDebugAndroidTest
./verify-apk.sh app/build/outputs/apk/debug/app-debug.apk
./device-release-check.sh app/build/outputs/apk/debug/app-debug.apk
```

Then complete the manual physical-device gates in `RELEASE_HARDENING_REPORT_0.4.1.md`.
