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
| Alto saxophone | Detailed licensed 3D model, touch targets, primary/alternate fingering tools | Specialist anatomical/fingering sign-off still required |
| Tenor / soprano / baritone saxophone | Transposition-aware practice and fingering trainer using the alto model | Not instrument-specific 3D anatomy; baritone low A unavailable |
| Oboe | Licensed Howarth S20C 3D anatomy preview and separate 2D chart | Not a fully mapped interactive 3D fingering trainer |
| Cor anglais | F-transposed tools, oboe-based model/chart | Proxy anatomy, not a dedicated cor anglais model |
| Flute / clarinet / bassoon | 2D fingering charts and shared audio/practice tools | No production 3D model; clarinet sourcing has licensing restrictions |
| Guitar | String tuner, chord diagrams and follow player | No 3D instrument lab |

Ten selectable instrument profiles do not mean ten production 3D models. Two licensed GLBs ship. Reference/fixture checks are not teacher review.

## Implemented product baseline

PR #8 corrected the oboe's 100x scaling bug and chart inconsistencies, added instrument-specific pitch ranges and octave guards, real per-part material customization, persistent IndexedDB takes, stronger metronome/tone-generator/analysis tools, and light-theme improvements. Those are no longer pending items from the superseded 6 September status table.

The distinctive mobile arc and configurable landscape edge remain in the shared UI. No replacement navigation or cosmetic redesign is part of PR #9.

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

## Security snapshot

The V1 candidate removes the unused Drizzle/D1 template layer that was the only remaining npm audit advisory chain. The release gate now rejects **any** registry-reported low, moderate, high or critical dependency finding instead of accepting moderate development-tool findings. A fresh audit remains mandatory for each candidate.

React/RSC, Vite, Vinext and Cloudflare tooling remain on the registry-confirmed versions introduced by the hardening pass.

## Practice tools depth (W2-C, `feat/w2-practice`)

The metronome (Pulse) and tone generator's exercise player share one lookahead audio scheduler now (`app/audio-scheduler.ts`) instead of each hand-rolling the same wake-on-a-timer loop; this was a behaviour-preserving extraction, verified against the full gate list before any feature work built on it.

The metronome gained a TonalEnergy-style gap drill (play N bars, rest M bars silently while the beat dot keeps moving) and seeded random beat drops (a per-beat chance of dropping out, repeatable from a saved seed so the same preset drops the same beats every time). Both compose with the existing tempo ramp, preset sequences and polyrhythm.

The tone generator's exercise player gained a saved exercise library (`app/exercise-library.ts`, key `bocal-exercises-v1`): scale (major, natural/harmonic/melodic minor, the five other modes, major/minor pentatonic), arpeggio (major/minor/dominant7/diminished7/augmented), chromatic, harmonic series, interval leaps, and a custom typed note list, each with a written root, a written range that repeats the pattern upward (by an octave, or another interval such as a fifth) as far as the range allows, tempo, note length, an articulation gap, loop, and a semitones-written-to-concert transposition. Six built-in presets ship (long tones, major scale by fifths, overtone series, interval leaps, chromatic warm-up, register slur) -- Bocal's own starting points, not transcribed from a method book. Export/import round-trips through the same save-file path takes and analysis exports already use.

The practice log (Practice tab) now lists individual logged sessions (tuner, metronome, tone generator, analysis, chords, repertoire) with a per-entry rename and delete, and its export uses that same save-file path -- closing a gap where it previously fell back to a plain browser download with no Android system picker. The weekly goal ring already counted every tool's logged minutes, not just the tuner's, before this wave; that part of the plan's brief undersold what was already shipped.

None of this has real-device audio/latency testing behind it; it is exercised by the same emulator/browser gates as the rest of the app.

## Still not proven

Real-device audio/latency/thermal and accessibility acceptance; specialist review of fingerings and 3D touch targets; production signing identity and distribution; comprehensive TonalEnergy parity/superiority; dedicated 3D parity across the other instrument families.
