# Bocal Android 0.4 — Validation Report

Validation run: 13 August 2026

## Passed in this workspace

- Both runtime glTFs load as `trimesh.Scene` objects from their final packaged paths.
- Alto sax: 8 geometries, 67,749 vertices, 104,547 faces/triangles.
- Howarth S20C oboe: 392 geometries, 106,760 vertices, 126,716 faces/triangles.
- No `.glb` legacy placeholder is present anywhere under `app/src/main/assets`.
- No excluded clarinet/flute/bassoon/procedural runtime model is present.
- Oboe PNG textures are maximum 2048px after mobile optimization.
- Catalog buffer/image references resolve.
- Model attribution/license files resolve.
- Sax metadata contains exactly 23 keys, 23 mechanics entries and 33 B-flat3 through F-sharp6 fingerings.
- All primary/alternate sax fingering key references point to known controls.
- Android manifest/resource XML parses.
- `android.permission.INTERNET` is absent.
- Five native task surfaces are wired: Tune, 3D lab, Pulse, Analyze, Practice.
- 3D Lab resolves to the local `WebViewAssetLoader` origin.
- Lab JavaScript, GLTFLoader and OrbitControls pass Node syntax checks.
- Pure Kotlin tests pass YIN at 220/440/880 Hz, pitch/transposition math and stable-note gating.

## Not validated in this workspace

- Android/Compose compilation: Android SDK/Build Tools/Gradle distribution are not installed here.
- APK installation/signing: no APK is fabricated.
- Physical Android System WebView rendering and GPU compatibility.
- Runtime memory/thermal behavior of the 126k-triangle oboe on low-end devices.
- Microphone route/permission interruption matrix on physical devices.
- TalkBack/Switch Access/manual accessibility QA.
- Human hands-on sax overlay sign-off.
- Any oboe fingering/control graph; the oboe remains anatomy-only by design.
