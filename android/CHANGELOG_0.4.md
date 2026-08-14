# Bocal Android 0.4 changelog

## Product/UI
- Replaced the older six-surface reference navigation with the latest five task tabs: Tune, 3D lab, Pulse, Analyze, Practice.
- Applied the current near-black/cyan/violet/gold Bocal visual language.
- Added Signal Truth, Fingering Lab and Current Evidence hierarchy to Tune.
- Rebuilt the local Instrument Lab around the latest detailed-model interaction patterns.

## 3D/model system
- Removed all legacy procedural runtime GLBs.
- Added detailed CC-BY alto saxophone and Howarth S20C oboe assets.
- Downscaled oboe textures from 4K to 2K maximum for mobile.
- Added local Three.js/GLTFLoader/OrbitControls runtime; no CDN required.
- Added explicit model-credit dialog and bundled license texts.
- Added four-view controls for both instruments.
- Added oboe part raycast/highlight inspection while deliberately locking fingering claims.

## Sax interaction
- Imported the validated 23-control / 33-fingering alto source contract.
- Added note -> fingering display, reverse exact-match lookup and Challenge mode.
- Added projected mesh-surface targets driven by validated control metadata rather than treating the licensed mesh as fingering authority.
- Preserved written pitch first and concert pitch second.

## Native engineering retained
- Stable YIN note gate and dropout handling.
- Microphone-source fallback.
- Live metronome setting updates.
- Local reference-tone engine.
- FileProvider-backed `.bocalbundle` export.
- Zero INTERNET permission.

## Validation/package
- Added strict model/license/texture/catalog/fingering checks.
- Added current Gradle/Compose dependency configuration.
- Updated README and APK build status for 0.4.
