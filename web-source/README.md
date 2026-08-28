# Bocal

Bocal is a local-first music practice app for learners, teachers and working musicians. The current public product combines a stable-note tuner, pulse and practice tools, local analysis, and instrument-specific spatial learning.

This repository is the source of truth for the hosted web app, its licensed 3D assets, visual masters, automated checks and the native Android foundation. The only public handoff download is `BOCAL_HANDOFF.md`.

## Current instrument support

| Instrument | Tuner | 3D learning readiness |
|---|---:|---|
| E♭ alto saxophone | Yes | Interactive fingering contacts, linked-mechanism trace and key-only glow |
| C oboe | Yes | Single-instrument anatomy preview and component inspection; fingering intentionally withheld pending specialist validation |

The instrument gallery also shows the planned woodwind sequence, but unavailable instruments cannot be selected.

## Product surfaces

- Confidence-gated chromatic tuner with explicit silence and local microphone processing.
- Metronome, tap tempo, drone, count-ins, silent-bar drills, saved presets, practice planning and deterministic local skill evidence.
- Tuner reference-tone keyboard with calibrated temperament, precision modes and safe synthetic voices; the guitar surface adds string tuning and colour-coded chord charts.
- Local waveform/spectrum views with named multi-take recording, import, loop, tempo playback, rename, delete and download.
- Practice distribution, weekly goals, gentle streak feedback, editable song progress and a local coach assignment/export board.
- Detailed licensed alto GLB with 23 semantic touch targets, view presets and full-screen focus mode.
- First-run expanding-panel instrument gallery and replayable four-step onboarding.
- Visual setup-part coverflow for finishes, necks, mouthpieces, reeds and ligatures.
- Native Kotlin/Compose source under `android/`; no APK is claimed until built and tested with an Android SDK and physical devices.

## Repository map

- `app/` — React/Vinext product source.
- `public/models/` — optimized public GLBs and attribution.
- `public/images/` — optimized cinematic web images.
- `assets/source/` — generated visual masters.
- `android/` — native Android foundation.
- `tests/` — product-truth, musical-data, asset and release checks.
- `docs/` — supporting research and validation notes.
- `BOCAL_HANDOFF.md` — consolidated product, persona, workflow, architecture and release handoff.

The native Android project remains a separate parity track. This branch improves the web experience and shared product contracts; it does not claim physical-device microphone accuracy, latency, interruption, Bluetooth or rotation results without hardware.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
```

`npm test` performs the verified production build before running the Node test suite.

## Android status

The checked-in native project targets API 36 and uses Kotlin/Compose with a local `AudioRecord`/YIN tuner foundation. Build it only in an environment with JDK 17, Android SDK 36 and the matching Gradle/AGP toolchain:

```bash
cd android
gradle :app:assembleDebug
gradle :app:testDebugUnitTest
gradle :app:lintDebug
```

No signing key belongs in this repository.

## Accuracy and rights

Musical truth is data-driven and versioned separately from rendering. The alto learning map remains an educational prototype pending named expert/device validation; the oboe is explicitly an anatomy preview. See `public/models/ATTRIBUTION.md` and `BOCAL_HANDOFF.md` for licences, exclusions and release gates.
