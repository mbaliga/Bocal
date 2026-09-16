# Bocal current state

Updated 17 September 2026 for PR #9, `feat/production-v1-hardening`.

## Release decision

Bocal is a hardened **v1.0.0 release candidate**, not yet an accepted/published production V1. Android `versionCode` is 8. A passing build or emulator run does not establish real microphone accuracy, musical correctness, production signing, or store acceptance. The current PR's Actions run is the evidence for its exact commit; do not substitute an older green run.

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

## Security snapshot

The V1 candidate removes the unused Drizzle/D1 template layer that was the only remaining npm audit advisory chain. The release gate now rejects **any** registry-reported low, moderate, high or critical dependency finding instead of accepting moderate development-tool findings. A fresh audit remains mandatory for each candidate.

React/RSC, Vite, Vinext and Cloudflare tooling remain on the registry-confirmed versions introduced by the hardening pass.

## Still not proven

Real-device audio/latency/thermal and accessibility acceptance; specialist review of fingerings and 3D touch targets; production signing identity and distribution; comprehensive TonalEnergy parity/superiority; dedicated 3D parity across the other instrument families.
