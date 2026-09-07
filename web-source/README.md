# Bocal

Bocal is a local-first music practice app for learners, teachers and working musicians. The current public product combines a stable-note tuner, pulse and practice tools, local analysis, and instrument-specific spatial learning.

This directory is the source of truth for the hosted web app, its licensed 3D assets, visual masters, automated checks and the Android shell. The one canonical handoff document is [`../docs/BOCAL_HANDOFF.md`](../docs/BOCAL_HANDOFF.md); `public/downloads/BOCAL_HANDOFF.md` is the copy served in-app from Settings and should always match it.

## Current instrument support

All ten instruments below are selectable today; see `docs/CURRENT_STATE.md` for the
full instrument × capability table. None of the fingering data has had a teacher
review yet — every chart and the sax altissimo set are badged "not yet
teacher-reviewed" in the app.

| Instrument | Tuner | Lab |
|---|---:|---|
| Alto, tenor, soprano, baritone saxophone | Yes | Interactive 3D fingering trainer (shown on the licensed alto model) |
| Oboe | Yes | 3D anatomy preview + fingering chart |
| Cor anglais | Yes | 3D anatomy preview (shown on the oboe model) + oboe fingering chart |
| Flute, clarinet, bassoon | Yes | 2D fingering chart, no licensed 3D model |
| Guitar | String tuner | Chord fretboard chart + follow player, no 3D model |

The instrument gallery also shows further planned families (bowed strings, brass,
keyboards, percussion, voice, electronic/MIDI) with no `InstrumentId` behind them;
those cards are not selectable.

## Product surfaces

- Confidence-gated chromatic tuner with explicit silence and local microphone processing.
- Metronome, tap tempo, drone, count-ins, silent-bar drills, saved presets, practice planning and deterministic local skill evidence.
- Tuner reference-tone keyboard with calibrated temperament, precision modes and safe synthetic voices; the guitar surface adds string tuning and colour-coded chord charts.
- Local waveform/spectrum views with named multi-take recording, import, loop, tempo playback, rename, delete and download.
- Practice distribution, weekly goals, gentle streak feedback, editable song progress and a local coach assignment/export board.
- Detailed licensed alto GLB with 23 semantic touch targets, view presets and full-screen focus mode.
- First-run expanding-panel instrument gallery (Woodwinds and Strings sections) and a replayable four-step onboarding whose "Learn" step and proof tile adapt to the chosen instrument's lab tier.
- Visual setup-part coverflow for finishes, necks, mouthpieces, reeds and ligatures.
- A WebView shell under `android/` (`MainActivity` → `WebAppScreen`) serving this build's static output; no APK is claimed until built and tested with an Android SDK and physical devices.

## Repository map

- `app/` — React/Vinext product source.
- `public/models/` — optimized public GLBs and attribution.
- `public/images/` — optimized cinematic web images.
- `assets/source/` — generated visual masters.
- `android/` — native Android foundation.
- `tests/` — product-truth, musical-data, asset and release checks.
- `docs/` — supporting research and validation notes.
- `public/downloads/BOCAL_HANDOFF.md` — the in-app "Download handoff" copy of `../docs/BOCAL_HANDOFF.md`, the consolidated product, persona, workflow, architecture and release handoff.

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

The checked-in project targets API 37 and wraps this app's static build in a WebView (`MainActivity` → `WebAppScreen`); the earlier Kotlin/Compose native UI and `AudioRecord`/YIN tuner remain in the tree only as an unused revert path. Build it only in an environment with JDK 17, Android SDK 37 and the matching Gradle/AGP toolchain:

```bash
cd android
gradle :app:assembleDebug
gradle :app:testDebugUnitTest
gradle :app:lintDebug
```

No signing key belongs in this repository.

## Accuracy and rights

Musical truth is data-driven and versioned separately from rendering. Every 2D fingering chart and the sax altissimo set are badged "not yet teacher-reviewed" until a qualified player checks them. See `public/models/ATTRIBUTION.md` and `../docs/BOCAL_HANDOFF.md` for licences, exclusions and release gates.
