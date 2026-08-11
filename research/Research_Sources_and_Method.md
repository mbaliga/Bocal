# Bocal research sources and method

Research snapshot: 10 August 2026. This is competitive/product research, not a legal opinion or a claim that every platform-specific TonalEnergy feature behaves identically on Android and iOS.

## Method

1. Treat TonalEnergy's own Android/Desktop user guide and mobile product page as the source of truth for the incumbent capability set. Store-listing copy was used only as a cross-check.
2. Treat instrument-maker educational references as a starting point for family, part, transposition, and fingering facts. Do not infer a complete fingering curriculum from a picture or from geometry.
3. Separate observed competitor facts from Bocal recommendations. A feature in a public guide is a parity requirement; its priority is still a product judgment.
4. Mark platform qualifiers. TonalEnergy itself labels some items as iOS-only or platform-dependent.
5. Do not copy competitor code, sounds, visual assets, text, or interaction trade dress. The Bocal implementations and 3D models are original reference work.

## Primary competitor sources

- [TonalEnergy Android/Desktop user guide](https://www.tonalenergy.com/tet-user-guide-android) — detailed table of contents and operating descriptions for tuning, temperament, pitch tracking, activity, metronome, preset sequencing, tone generation, analysis, recording, custom views, preferences, remote control, and MIDI.
- [TonalEnergy mobile product page](https://www.tonalenergy.com/te-mobile) — summarizes the C0–C8 Target Tuner, provided/custom temperaments, mode/range, reference A and transposition; tone sound library and exercise surfaces; waveform/spectral/staff/interval analysis; programmable metronome and silence/count-in functions; recording/editing; integrations; preferences; accessibility.
- [TonalEnergy home and education navigation](https://www.tonalenergy.com/) — corroborates retail, desktop, education, organization/student, parent, and support contexts.
- [TonalEnergy information for parents](https://www.tonalenergy.com/for-parents) — confirms the parent/legal-guardian and under-13 privacy/consent context. Bocal's no-account local-first design can reduce, but does not erase, child-privacy responsibilities.

### Capability interpretation

The official guide's breadth is the reason this handoff does not call a basic tuner “parity.” The documented product includes:

- Target and Bar tuner styles; cent resolution to tenths; volume and tone meters; note-start and last-interval options; transposition, notation, adjustable reference A, modes, ranges, damping, equal/just/provided/custom temperaments, pitch tracking, timed events, per-note activity, calendars and goals.
- Metronome tempo entry/tap, beat chooser, meters, subdivisions, accents, multiple sounds, visual flash, count-in, animated display, programmable presets, sequences, loops and groups, tempo changes, silence exercises, Ableton Link and BodyBeat.
- Tone generation through wheel, keyboard and pitch grid; synthesized and sampled sound choices; auto-reference and exercise creation.
- Waveform/pitch, spectral, harmonic-energy, note-staff, interval-training and mixer surfaces.
- Audio recording/playback, folders, trim/rename/delete, import/export, tempo and pitch adjustment, and platform-dependent video.
- MIDI/remote control, external displays and audio devices, languages/notation systems, VoiceOver and sharing.

These statements describe TonalEnergy's documented scope, not an independent quality benchmark. The parity matrix records implementation status feature by feature.

## Instrument and pedagogy sources

- [Yamaha saxophone family](https://www.yamaha.com/en/musical_instrument_guide/saxophone/structure/structure002.html) — states that Adolphe Sax originally conceived 14 family members and identifies six in widespread use, high to low: sopranino, soprano, alto, tenor, baritone and bass.
- [Yamaha saxophone fingering](https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play002.html) — provides a basic chart, alternatives where available, and states that basic finger work is shared across saxophones, with the baritone low-A exception.
- [Yamaha saxophone transposition](https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play003.html) — explains written versus sounding pitch, the shared fingering rationale, and B-flat/E-flat examples.
- [Yamaha fingering hub](https://www.yamaha.com/en/musical_instrument_guide/feature/fingering/) — routes to flute, recorder, clarinet, saxophone, oboe and bassoon fingering references.
- [Yamaha woodwind-family overview](https://hub.yamaha.com/winds/wood/the-woodwind-family-explained/) — identifies the common flute/piccolo/recorder/clarinet/saxophone/oboe/bassoon families and explains tone holes, keyed and open-hole mechanisms, single and double reeds, and common variants.

The model catalog intentionally goes wider than only the most common instruments. “Covered” means a selectable educational model exists, not that a complete note chart has been certified. A qualified teacher/player must approve every family-specific map, alternate fingering, trill, range, octave convention, and manufacturer mechanism before publication.

## Android and web platform sources

- [Android low-latency audio with Oboe](https://developer.android.com/games/sdk/oboe/low-latency-audio) and [AAudio guide](https://developer.android.com/ndk/guides/audio/aaudio/aaudio) — production capture/rendering direction and device-variability caveats.
- [Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord) — platform input API used by the compact native reference.
- [Android haptic effects](https://developer.android.com/develop/ui/views/haptics/custom-haptic-effects) — capability-aware waveform/composition guidance.
- [WebViewAssetLoader](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader) and [local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) — secure local asset hosting used for the Three.js laboratory without an Internet permission.
- [Android offline-first guidance](https://developer.android.com/topic/architecture/data-layer/offline-first) and [Room](https://developer.android.com/training/data-storage/room) — target local data architecture.
- [Media3 Transformer](https://developer.android.com/media/media3/transformer) — future on-device trim/transcode/playback transformation path.
- [Compose accessibility](https://developer.android.com/develop/ui/compose/accessibility) and [adaptive layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive) — semantics, target size, state descriptions, and phone/tablet layout direction.
- [AGP 9.3 release notes](https://developer.android.com/build/releases/gradle-plugin) — as of the research date: Gradle 9.5.0, Build Tools 36.0.0, JDK 17, maximum API 37.
- [Built-in Kotlin migration](https://developer.android.com/build/migrate-to-built-in-kotlin) — AGP 9+ enables Kotlin compilation without the legacy Android Kotlin plugin.
- [Kotlin releases](https://kotlinlang.org/docs/releases.html) — 2.3.21 is the latest stable entry in the source as of the snapshot.
- [AndroidX WebKit releases](https://developer.android.com/jetpack/androidx/releases/webkit) — 1.16.0 stable; min SDK 24.
- [AndroidX Lifecycle releases](https://developer.android.com/jetpack/androidx/releases/lifecycle) — 2.11.0 stable at the snapshot.
- [Compose BOM mapping](https://developer.android.com/develop/ui/compose/bom/bom-mapping) — source for the pinned Compose UI/foundation 1.11.4 and Material 3 1.4.0 reference versions.
- [glTF](https://www.khronos.org/gltf/) — royalty-free runtime 3D delivery format used by the model pack.
- [Filament](https://github.com/google/filament) — production alternative for native physically based glTF rendering when replacing the local WebView is worth the cost.

## DSP and accessibility sources

- Alain de Cheveigné and Hideki Kawahara, [YIN, a fundamental frequency estimator](https://mu.krj.st/files/yin.pdf) — algorithmic basis for the clean-room difference/CMND detector.
- Philip McLeod and Geoff Wyvill, [A Smarter Way to Find Pitch](https://www.cs.otago.ac.nz/graphics/Geoff/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf) — MPM option for future comparative tests.
- Sebastian Nieradzik, [SwiftF0](https://arxiv.org/abs/2508.18440) — small neural pitch model candidate. Published benchmarks are not a substitute for sax/woodwind device testing.
- [ONNX Runtime mobile](https://onnxruntime.ai/docs/tutorials/mobile/) — possible deployment layer for a validated neural model.
- W3C, [Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html) and [Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) — status must not depend on hue alone; controls/indicators need sufficient contrast.

## Research limitations and next evidence

- No independent comparative latency/accuracy benchmark was run against TonalEnergy. The next defensible claim requires the same labeled woodwind corpus and device set for both apps.
- Public feature documentation cannot reveal competitor algorithms, sound licenses, retention, defect rates or internal roadmap.
- Fingering charts vary by system, range, register and pedagogical convention. An authoritative-looking interactive model makes wrong content more harmful, not less.
- The 3D pack received structural validation only. It needs visual review from front/back/left/right plus a pedagogical review checklist per family.
- A genuine APK build and device run were blocked by the absent Android SDK/build toolchain in this environment; the source and deterministic build/verification scripts are supplied.
