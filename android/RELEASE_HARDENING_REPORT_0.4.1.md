# Bocal Android 0.4.1 — Release hardening report

Date: 2026-08-13
Status: HARDENED SOURCE, APK/PHYSICAL-DEVICE CERTIFICATION BLOCKED BY TEST ENVIRONMENT

## Preserved model truth boundaries

- Alto saxophone remains the only fingering-capable detailed model. Its teaching contract retains 23 validated player touch-pieces and 33 written fingerings from B-flat3 through F-sharp6.
- The detailed Howarth Conservatoire S20C oboe remains anatomy/exploration only. The UI must not present it as a validated fingering trainer.
- No legacy procedural GLB placeholders were reintroduced.
- No Internet permission was added.

## Hardening changes in 0.4.1

- Stops tuner/analyzer microphone capture and metronome activity when the activity enters ON_STOP.
- Handles AudioRecord dead/invalid routes without leaving the capture loop marked active.
- Restricts the 3D Lab WebView to the packaged appassets origin, disables file/content access, DOM storage, mixed content, popups, multiple windows and external navigation.
- Recovers the Lab after a WebView renderer-process death by recreating the WebView.
- Disables cloud backup of Bocal practice preferences/files/databases; device-to-device transfer of preferences remains allowed.
- Adds dark launch/status/navigation surfaces to avoid a light launch flash.
- Adds Compose test tags and accessibility semantics for primary navigation, pitch trace summaries and beat state.
- Adds live-region/role semantics to the local Instrument Lab HTML and aria-pressed state to active controls.
- Adds Android instrumentation smoke tests for launch, five-job navigation and the embedded WebView boundary.
- Adds `device-release-check.sh`, which refuses certification unless exactly one authorized adb target is present and the APK installs and cold-launches without an immediate crash.

## Validation executed in this environment

PASS — `static-check.sh`
- Android XML parses.
- No `android.permission.INTERNET`.
- Five-tab native shell and local detailed Lab are wired.
- Detailed sax and oboe assets, local licenses and validated sax metadata are present.
- Sax: 104,547 triangles; 23 touch-pieces; 33 written fingerings.
- Oboe: 392 meshes; 126,716 triangles; anatomy-preview boundary.
- Local Lab JavaScript syntax passes.

PASS — `pure-smoke-test.sh`
- YIN pitch fixtures.
- Pitch/transposition math.
- Stable-note gating.

PASS — hardening source review
- Audio stop-on-background paths added to Tune, Pulse and Analyze.
- WebView is local-origin-only and outbound requests/navigation are blocked.
- Cloud backup exclusions are explicit.
- Instrumentation test runner and current AndroidX Test dependencies are explicit.

## Gates that could NOT be executed here

BLOCKED — Android compilation
- This runner has Java 21 but no Android SDK, `sdkmanager`, `adb` or Gradle installation.
- The project has Gradle wrapper properties, but the wrapper JAR/scripts and Gradle distribution are not locally available in this Bocal source snapshot.
- Shell networking cannot resolve `dl.google.com` or `services.gradle.org`, so the missing Android toolchain cannot be bootstrapped here.

BLOCKED — APK verification
- Because Android compilation did not run, no APK is claimed or included.

BLOCKED — emulator / physical-device execution
- No adb target is exposed to this session.
- Therefore install, launch, permission-dialog interaction, WebView GPU behavior, memory pressure and renderer recovery were not executed on Android hardware here.

BLOCKED — physical acoustic validation
- Sax overlay alignment still requires visual inspection against the detailed horn while switching Player/Left/Right/Back views and operating the 23 touch-pieces.
- Oboe rendering still requires real-device rotate/zoom/pick inspection across the detailed 392-mesh Howarth asset.
- Live tuner/analyzer behavior still requires real microphone input, denial/grant cycles, wired/Bluetooth route changes and background/foreground transitions.
- TalkBack/Switch Access and large-text/display-size passes require an Android target.

## Exact release gate

Do not label an APK "verified" until all of these succeed on a real Android toolchain/target:

1. `./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug`
2. `./gradlew --no-daemon connectedDebugAndroidTest` on an emulator or attached device.
3. `./verify-apk.sh app/build/outputs/apk/debug/app-debug.apk`
4. `./device-release-check.sh app/build/outputs/apk/debug/app-debug.apk`
5. Manual sax overlay check: all 23 touch targets land on plausible player controls in all four views; linked-pad teaching remains distinct from finger contact.
6. Manual oboe check: Howarth model loads, rotates, zooms and picks reliably with no fingering claim introduced.
7. Live audio: permission deny/grant, stable sax/oboe long tones, interruption/background stop, wired/Bluetooth route changes.
8. Accessibility: TalkBack traversal/labels, Switch Access, large font/display size, local Lab accessible controls and no focus trap.

Only after those gates pass should the debug APK be renamed or distributed as the first verified Bocal Android APK.
