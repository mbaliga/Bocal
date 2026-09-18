# Bocal current state

Updated 18 September 2026 for `feat/w2-practice` (W2-C practice-tools-depth), on top of PR #9's `feat/production-v1-hardening`.

## Release decision

Bocal is a hardened **v1.0.0-rc.1 release candidate**, not yet an accepted/published production V1. Android `versionCode` is 8. A passing build or emulator run does not establish real microphone accuracy, musical correctness, production signing, or store acceptance. The current PR's Actions run is the evidence for its exact commit; do not substitute an older green run.

## Canonical source

- `web-source/`: the maintained product, shared by browser and Android.
- `android/`: thin local WebView host. Gradle packages the generated standalone web application; do not edit generated HTML.
- `web-source-v6/`, `web-standalone/`, and the generated models in `models/glb/`: historical prototypes/reference material, not production entry points. Their instrument counts and old verification records are not current product claims.
- `docs/PRODUCTION_V1_ACCEPTANCE.md`: remaining release gates.

## Instrument coverage

| Instrument | Current learning experience | Boundary |
|---|---|---|
| Alto saxophone | Detailed licensed 3D model, touch targets, primary/alternate fingering tools, plus a generated 2D chart under the 3D stage | Specialist anatomical/fingering sign-off still required |
| Tenor / soprano / baritone saxophone | Transposition-aware practice and fingering trainer using the alto model; baritone's low A3 (a written note the other three saxes don't have) is on the 2D chart, sourced against the Woodwind Fingering Guide and Yamaha's official guide, with a plain note that the alto model has no such key | Not instrument-specific 3D anatomy |
| Oboe | Licensed Howarth S20C 3D anatomy preview and separate 2D chart | Not a fully mapped interactive 3D fingering trainer |
| Cor anglais | F-transposed tools, oboe-based model/chart, oboe's own written range (no low B♭) | Proxy anatomy, not a dedicated cor anglais model; a handful of English-horn-specific alternate fingerings exist on the Woodwind Fingering Guide but could not be confirmed against a second source, so they are not shown |
| Flute / clarinet / bassoon | 2D fingering charts and shared audio/practice tools; the flute chart now reaches C7 (two-source confirmed against the Woodwind Fingering Guide and flutetunes.com) | No production 3D model; clarinet sourcing has licensing restrictions; bassoon's chart still stops at G♯4 -- the notes above lean on a flick-key convention that could not be pinned down with a second source |
| Guitar | String tuner, chord diagrams and follow player | No 3D instrument lab |

Ten selectable instrument profiles do not mean ten production 3D models. Two licensed GLBs ship. Reference/fixture checks are not teacher review.

## Implemented product baseline

PR #8 corrected the oboe's 100x scaling bug and chart inconsistencies, added instrument-specific pitch ranges and octave guards, real per-part material customization, persistent IndexedDB takes, stronger metronome/tone-generator/analysis tools, and light-theme improvements. Those are no longer pending items from the superseded 6 September status table.

The distinctive mobile arc and configurable landscape edge remain in the shared UI. No replacement navigation or cosmetic redesign is part of PR #9.

## Wave 2: 3D model depth (W2-E)

The alto saxophone's fused body mesh (neck tube, body, bow and bell in one primitive) was re-segmented into four primitives that share the original vertex data and material, so the "Look" panel can address each part independently. The neck now has three cosmetic variants (reusing the setup explorer's C1/E1/V1 neck descriptions, each applying a small illustrative bend -- it is not a claim that the model's bore taper actually differs between them) and the bell can take its own finish, independent of the rest of the body. The oboe's wooden body mesh was similarly split, by Y, into top joint, lower joint and bell, with a small procedural cork/tenon ring drawn at each seam; the exploded view now separates the two joints. Neither GLB's geometry, UVs or normals were changed -- see `web-source/public/models/ATTRIBUTION.md` for the CC BY 4.0 modification notices and `web-source/scripts/segment-model.mjs` for the method. Pad geometry (a "pads" group extracted from the keywork mesh) was investigated and not shipped: the keywork mesh has no reliable name, material or component-boundary signal separating a pad from its key cup, and a same-day heuristic was not reliable enough to ship (see that script's header and `web-source/docs/import-model.md`). The Sketchfab flute has not been downloaded and is not in this build; `web-source/docs/import-model.md` has the import checklist for when it is.

## Production-hardening changes in PR #9

- Recording writes succeed only after an IndexedDB transaction commits; failed or blocked storage gives visible local feedback.
- Per-take operations are ordered. A rename/delete cannot race an unfinished create. Deletion is confirmed and only removed from the UI after success.
- Existing takes are never automatically evicted. The 12-take capacity gate runs before a new import/recording. Exports are a separate backup, not a cloud sync.
- Imports are bounded to 32 MiB; recordings stop at 10 minutes or their size limit. Stop/background/unmount cancels stale microphone requests and preserves received recording data where the browser can finish it.
- Android uses a system Save As picker, bounded bridge transfer, background writes and cancellation/failure feedback. There is no silent blob-download fallback inside Android.
- Trusted-origin microphone and navigation checks, explicit callback cleanup, and a shared app error boundary.
- Debug and release workflows share mandatory typecheck, tests, lint, builds, browser/contrast checks, and zero-finding dependency gating.
- APK/AAB verification checks ZIP integrity, embedded models and byte-for-byte identity with the tested standalone application.
- Signed candidate builds require all signing inputs, verify signatures and checksums, and do not automatically publish or claim device acceptance.
- The standalone bundle's build target is Chrome 69, and the Android shell checks the installed WebView's version before loading it: below Chrome 69 (Android System WebView from mid-2018) it shows a native "update WebView" screen with a link to the Play listing instead of a blank, silently-crashing page. The API 26 `google_apis` emulator image ships Chrome 69 exactly, so CI's API 26 job exercises the floor itself, not just old `minSdk`.

## Tuner structure and depth (wave 2, W2-A)

`page.tsx` (formerly 2054 lines) is decomposed into `useTuner.ts` (the
AudioContext/analyser/StablePitchTracker/pitch-history sampling loop),
`usePersistedSetting.ts` (a generic localStorage-backed setting hook),
`TunerView.tsx` and `DownloadCenter.tsx`, verified behaviour-preserving
before any feature landed. Every localStorage key the app writes is now a
named constant in `storage-keys.ts`; a test asserts every call site
resolves to one. `hzToMidi`/`midiToHz`/`centsBetween`/`median`/`clamp` have
one implementation each in `music-math.ts`, migrated into this package's own
files (other packages' copies are unmigrated by design, left for wave 2's
round 2).

New tuner features:

- **Manual target-note lock**: tap the note name (or pick any note from the
  instrument's range via the secondary "Target" control) to lock the
  reading to that exact note; cents are then measured against the lock
  regardless of what the pitch tracker would otherwise round to. Persists
  across Start/Stop within the page session, not across a reload.
- **Pitch pipe**: press and hold the readout to hear the locked (or
  currently showing) note through the existing calibrated reference-tone
  path, released on pointer up. Shares the tuner's one AudioContext.
- **Written/concert readout toggle** (Calibration, shown for any
  transposing instrument): flips the note name, staff and pitch-history
  staff mode between written and concert pitch.
- **Auto-follow wiring**: the tone generator's existing "Follow my pitch"
  toggle is now actually wired to the live tuner's locked reading.
- **dBFS level meter** replaces the old gate-relative "Input" bar: RMS
  converted to dBFS, a 1s peak hold, and a clip indicator off the raw
  sample peak, labelled honestly as dBFS.
- Cents are tracked to tenths internally (`tuning.ts`'s
  `TuningReading.centsTenths`, additive -- existing callers' whole-cent
  `cents` field is unchanged) so the ±2¢ (Ultra) precision setting compares
  an unrounded value against its own tolerance; the readout shows whole
  cents except at Ultra, where it shows one decimal.

None of this has been checked against a physical device or a teacher; the
browser/contrast/e2e gates are automated-only evidence, same caveat as the
rest of this document.

## Security snapshot

The V1 candidate removes the unused Drizzle/D1 template layer that was the only remaining npm audit advisory chain. The release gate now rejects **any** registry-reported low, moderate, high or critical dependency finding instead of accepting moderate development-tool findings. A fresh audit remains mandatory for each candidate.

React/RSC, Vite, Vinext and Cloudflare tooling remain on the registry-confirmed versions introduced by the hardening pass.

## Wave 2: Analyze depth (W2-B)

- The Analyze view has a fourth live mode, Spectrogram: a log-frequency waterfall (note-name ticks, 20-second scrolling window) drawn from the same analyser the other three modes already use, with no second AnalyserNode. It follows `prefers-reduced-motion` by scrolling more slowly rather than not updating, and pauses/resumes with the rest of live capture.
- A saved take can be compared against a second saved take: an A/B overlay draws the compared take's pitch trace dashed in a second colour on top of the primary one, aligned either by each recording's own start or by its first sounding note, with a one-line difference summary (mean cents, spread) between the two. The compared take's analysis is cached the same way the primary take's is.
- Takes can carry free-text tags and notes, sanitised and stored in the same IndexedDB record as the recording; the take library can be sorted (newest/oldest/longest/shortest/name) and filtered by tag. None of this changes the no-eviction, commit-aware storage semantics already in place.
- A transcription can be exported as a Standard MIDI File or MusicXML (`app/score-export.ts`, buttons in the Transcribe panel, saved through the same native-aware save path takes use). Both are quantised to a fixed, honestly-labelled tempo grid -- Bocal has no beat detector, so this is not a measured tempo.
- The theme text-contrast audit (`tests/theme.test.mjs`) now populates the take library with two imported fixtures and walks the spectrogram tab and the A/B compare view, not just the previously-empty take card. That coverage surfaced a pre-existing light-theme contrast gap in the take list and tempo/loop controls (never exercised before because the audit never had a saved take to show); it is fixed in `app/styles/analysis.css` with the same fixed-dark-backdrop technique already used for the harmonics overlay, without editing `globals.css`.

## Wave 2: Practice tools depth (W2-C)

The metronome (Pulse) and tone generator's exercise player share one lookahead audio scheduler now (`app/audio-scheduler.ts`) instead of each hand-rolling the same wake-on-a-timer loop; this was a behaviour-preserving extraction, verified against the full gate list before any feature work built on it.

The metronome gained a TonalEnergy-style gap drill (play N bars, rest M bars silently while the beat dot keeps moving) and seeded random beat drops (a per-beat chance of dropping out, repeatable from a saved seed so the same preset drops the same beats every time). Both compose with the existing tempo ramp, preset sequences and polyrhythm.

The tone generator's exercise player gained a saved exercise library (`app/exercise-library.ts`, key `bocal-exercises-v1`): scale (major, natural/harmonic/melodic minor, the five other modes, major/minor pentatonic), arpeggio (major/minor/dominant7/diminished7/augmented), chromatic, harmonic series, interval leaps, and a custom typed note list, each with a written root, a written range that repeats the pattern upward (by an octave, or another interval such as a fifth) as far as the range allows, tempo, note length, an articulation gap, loop, and a semitones-written-to-concert transposition. Six built-in presets ship (long tones, major scale by fifths, overtone series, interval leaps, chromatic warm-up, register slur) -- Bocal's own starting points, not transcribed from a method book. Export/import round-trips through the same save-file path takes and analysis exports already use.

The practice log (Practice tab) now lists individual logged sessions (tuner, metronome, tone generator, analysis, chords, repertoire) with a per-entry rename and delete, and its export uses that same save-file path -- closing a gap where it previously fell back to a plain browser download with no Android system picker. The weekly goal ring already counted every tool's logged minutes, not just the tuner's, before this wave; that part of the plan's brief undersold what was already shipped.

None of this has real-device audio/latency testing behind it; it is exercised by the same emulator/browser gates as the rest of the app.

## Still not proven

Real-device audio/latency/thermal and accessibility acceptance; specialist review of fingerings and 3D touch targets; production signing identity and distribution; comprehensive TonalEnergy parity/superiority; dedicated 3D parity across the other instrument families.
