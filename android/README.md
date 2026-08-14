# Bocal Android 0.4

Bocal 0.4 is the merged native Android foundation for the latest Bocal product direction: local-first audio and practice tools in Kotlin/Jetpack Compose, plus a fully local detailed Instrument Lab for validated alto-sax fingering and honest oboe anatomy exploration.

## What changed in 0.4

### Latest task shell and visual language

- Five bottom tasks: **Tune, 3D lab, Pulse, Analyze, Practice**.
- Near-black surfaces, cyan measured/active state, violet context, restrained gold instrument accents, rounded cards and explicit text/shape redundancy.
- Latest tuner hierarchy: written note first, concert note secondary, signed cents, stable-note state, Signal Truth guidance, Fingering Lab entry and Current Evidence.
- Latest Instrument Lab patterns: Learn/Challenge, note browser, model-truth/credit strip, four named views, direct model interaction, written/concert pitch card, local reference tone, fingering contact list and explicit validation boundary.
- The Lab is responsive and scrollable inside a local `WebViewAssetLoader` surface; no hosted UI is required.

### Detailed runtime models — no procedural placeholders

0.4 deliberately removes the 0.2/0.3 procedural woodwind GLBs from the runtime package.

Included:

- **Alto saxophone** — licensed CC-BY-4.0 detailed reference mesh, 8 glTF meshes, 10 glTF nodes, **104,547 triangles**. Bocal overlays the validated 23-touch-piece control graph and 33 chromatic written fingerings from B-flat3 through F-sharp6. Four view filters expose player/front, left controls, right controls and thumb/back relationships.
- **Howarth Conservatoire S20C oboe** — licensed CC-BY-4.0 detailed reference, **392 meshes, 907 glTF nodes, 126,716 triangles**. Its original 4K textures are mobile-capped to 2K. It is an anatomy/part inspector only until an oboe fingering graph receives equivalent expert validation.

Not included:

- The available detailed clarinet source is CC-BY-NC-4.0. It is intentionally excluded from a potentially commercial Bocal build.
- The older generated 35-instrument family is intentionally excluded because the user specifically requested no placeholder procedural models.
- Alternate sax packages with unknown or redundant provenance are not used when the selected detailed CC-BY source is already present.

See `MODEL_MANIFEST.md` and the license files under `app/src/main/assets/www/licenses/`.

## Validated sax interaction contract

Runtime sax metadata lives at:

`app/src/main/assets/www/data/sax-metadata.json`

The validation script enforces:

- exactly **23** player touch-pieces;
- exactly **23** mechanics entries;
- exactly **33** chromatic written fingerings, B-flat3 through F-sharp6;
- no fingering references to unknown controls;
- primary and documented alternate routes remain representable;
- display geometry is not mislabeled as service-CAD geometry.

The detailed licensed mesh does not contain Bocal-authored stable `control_*` nodes. 0.4 therefore projects the validated pedagogical control graph onto the actual mesh surface with local Three.js raycasts. That makes the model useful for teaching without pretending the licensed mesh itself is the validation authority.

## Native features retained from 0.3

- **Tune** — foreground `AudioRecord`, clean-room YIN detector, stable-note hysteresis/dropout handling, adjustable A4/tolerance, concert/E-flat/B-flat mapping, signed cents, gauge and bounded trace.
- **Pulse** — native scheduler, tap tempo, meter/subdivision, visual beat state and optional haptics; live changes restart the active timeline cleanly.
- **Reference tone engine** — local looping `AudioTrack` oscillator remains available to product surfaces and the Lab has its own local Web Audio reference-note control.
- **Analyze** — user-initiated microphone snapshot using the same stable-note gate as Tune.
- **Practice** — local timer, lesson note, recent sessions and explicit FileProvider-backed `.bocalbundle` export.

The Android manifest declares `RECORD_AUDIO` and `VIBRATE`; it deliberately does **not** declare `android.permission.INTERNET`.

## Local Instrument Lab architecture

`LabScreen` loads only:

`https://appassets.androidplatform.net/assets/www/lab.html`

through `WebViewAssetLoader`. The HTML, CSS, Three.js runtime, GLTFLoader, OrbitControls, catalogs, model files, textures and license text all ship inside the APK assets. There is no CDN or hosted model dependency.

The Lab supports:

- detailed alto and oboe selector;
- four orientation views;
- orbit/reset controls;
- sax note -> fingering display;
- sax manual control selection -> exact fingering reverse match;
- Challenge mode against primary/validated alternate fingering routes;
- linked-pad/mechanism text traces from the validated source contract;
- oboe mesh picking and part highlighting without fingering claims;
- local license/credit dialog.

## Checks completed in this workspace

```text
PASS: detailed sax/oboe assets, 2K textures, licenses, and validated sax interaction metadata
PASS: alto sax = 104,547 triangles; 23 touch-pieces; 33 written fingerings
PASS: oboe = 392 meshes; 126,716 triangles; anatomy-preview boundary
PASS: XML parses; zero INTERNET permission; latest five-tab Android shell and local detailed Lab are wired
PASS: local Lab JavaScript syntax
PASS: YIN, pitch/transposition math, and stable-note gating
```

Run them with:

```bash
./static-check.sh
./pure-smoke-test.sh
```

## Supported build toolchain

The project is configured for:

- JDK 17
- min SDK 26
- compile/target SDK 36
- Android Gradle Plugin 9.3.0
- Gradle 9.5.0
- Kotlin/Compose compiler plugin 2.3.21
- Compose BOM 2026.06.00
- Activity Compose 1.13.0
- Lifecycle Runtime Compose 2.11.0
- AndroidX WebKit 1.16.0

## Build a debug APK

This source tree intentionally does not fake an APK. On a machine with Android SDK Platform 36, Build Tools 36.0.0 and Gradle 9.5.0 available:

```bash
./build-apk.sh
```

Expected output:

`app/build/outputs/apk/debug/app-debug.apk`

`verify-apk.sh` checks the APK container and, when `apkanalyzer` is installed, prints application ID and permissions.

## Release gates still required

0.4 is a materially better source release, but source validation is not physical-device certification. Before a public release:

- compile all Android sources with the real SDK and run JVM/instrumented tests;
- test on API 26 plus representative mid-range and current high-end devices;
- measure microphone routing, interruption, Bluetooth behavior, latency and thermal impact;
- run labeled woodwind pitch/error benchmarks and long metronome drift tests;
- visually QA both detailed models in Android System WebView, including renderer death/recovery and low-memory devices;
- complete TalkBack, large-text, switch access, reduced-motion and contrast checks;
- obtain the remaining hands-on sax teacher/repair-tech sign-off before calling the detailed overlay human-certified;
- build and review an oboe-specific control/fingering graph before enabling oboe fingering lessons.

Bocal 0.4 is intentionally strict about the distinction between **detailed display geometry**, **source-validated musical metadata**, and **human-certified educational truth**.

## 0.4.1 release-hardening addendum (2026-08-13)

This source snapshot includes lifecycle/audio, WebView-origin, backup-privacy, accessibility and instrumentation hardening. See `RELEASE_HARDENING_REPORT_0.4.1.md` and `DEVICE_TEST_PLAN.md`.

A verified debug APK is **not** included because this execution environment exposes no Android SDK/Gradle/adb target and cannot bootstrap them over shell networking. Do not treat a source-only check as device certification. The included release scripts deliberately fail closed until a real Android build/target is available.
