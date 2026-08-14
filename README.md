# Bocal

Bocal is a music-learning application for saxophone and other woodwinds, covering
tuning, tone and practice workflows with an interactive 3D instrument lab.

This repository is the import of the Bocal 0.2 reference handoff dated 10 August 2026,
plus a later in-progress source iteration. It is a snapshot of prototype work, not a
released product — read [Status and limits](#status-and-limits) before relying on any
part of it.

## Layout

| Path | Contents |
| --- | --- |
| `web-standalone/` | TypeScript/Vite standalone app. `dist/` is the ready-to-host static build (serve over HTTPS — microphone access requires it). |
| `web-source/` | Next.js/vinext hosted-Sites variant, including the client-only 3D loading boundary. |
| `web-source-v6/` | Later, divergent iteration of `web-source`. Not a drop-in replacement — see [The v6 source](#the-v6-source). |
| `android/` | Kotlin/Jetpack Compose Android project, version 0.5.0. Six-workspace shell over three detailed third-party glTF instruments — see [Android 0.5 and model licensing](#android-05-and-model-licensing). |
| `models/` | 35 original educational woodwind GLBs, plus catalog, generator and validator. |
| `research/` | 84-row TonalEnergy parity matrix, 10 personas × 5 workflows, source ledger, baseline delta. |
| `docs/` | Product handoff (MD/DOCX/PDF), saxophone validation and parity spec, alto 3D model brief, music-learning baseline. |
| `qa/` | Verification record: what was checked, and what explicitly was not. |
| `screenshots/` | Prototype screenshots. |

## Getting started

The standalone web app is the fastest way to see Bocal running:

```bash
cd web-standalone
npm install
npm run build
npm run test     # smoke suite: 35 instruments, 6 workspaces
```

Serve `web-standalone/dist/` over HTTPS — the browser will not grant microphone
access to a plain-HTTP origin.

To validate the 3D model set:

```bash
python3 models/validate_models.py
```

## Status and limits

The 0.2 handoff was candid about what had and had not been verified, and that
carries over to this import. `qa/VERIFICATION.md` is the original record.

**Verified by re-running it here:** `npm run build` and `npm run test` in
`web-standalone/` both pass — 35 instruments, 6 workspaces, static build present. The
rebuild reproduces the committed `web-standalone/dist/` byte-for-byte, so the
checked-in ready-to-host build is authentic to its source. `models/validate_models.py`
passes: 35 GLBs parse as glTF 2.0 and agree with the catalog, with 465 named
interactive controls. In `android/`, the shell half of `static-check.sh` passes — the
XML parses, there is no `INTERNET` permission, and the six-tab shell and local Lab are
wired.

**Carried over from the handoff, not re-checked here:** the 27-page document render
and page-by-page review. The 0.2 claim that the Android asset bundle mirrored the
standalone build no longer holds — 0.5 replaced those assets entirely.

**Not verified:**

- **No APK is included, and none has been built** — still true at 0.5, which has had
  release hardening but no compile. `android/` needs a real Android Studio/SDK compile,
  unit-test, instrumentation, install and device-validation pass. `android/build-apk.sh`,
  `verify-apk.sh` and `device-release-check.sh` document that path.
- **The 35 in-house 3D models are educational reference geometry, not repair or CAD
  models.** Only the alto saxophone has a core note map. Other instruments expose
  recognizable parts and controls but must not be presented as certified fingering
  tutors until family specialists approve their note maps and mechanisms. In the
  Android 0.5 app the oboe and clarinet are explicitly anatomy/part inspectors only,
  with note-to-fingering linkage disabled.
- Microphone accuracy, latency, octave errors, metronome long-run drift and
  battery/thermal behavior are untested — they need labeled audio fixtures and
  representative devices.
- WebGL appearance was never confirmed in a real browser; the build environment's
  WebGL process failed. Physical-browser QA remains an open gate.
- Any claim of parity with or superiority to TonalEnergy is unproven, and would
  require moderated matched-task studies on a shared device and audio corpus.

## Android 0.5 and model licensing

`android/` is version 0.5.0 and no longer matches the rest of this repository's
model story. Where `models/` and `web-standalone/` carry 35 in-house generated GLBs,
the Android app now ships **three detailed third-party glTF models** — alto sax,
Howarth oboe and clarinet — with textures, plus a vendored Three.js runtime. It
restores a six-workspace shell (Tune, Lab, Sound, Pulse, Analyze, Practice) as a
floating two-tier dock, adds instrumentation tests, and hardens the app with
`usesCleartextTraffic=false` and a non-exported FileProvider. `INTERNET` is still
deliberately absent; `RECORD_AUDIO` and `VIBRATE` remain the only permissions.

**The clarinet model is CC-BY-NC-4.0 — it forbids commercial use.** The sax and oboe
models are CC-BY-4.0 (commercial use allowed, attribution required) and Three.js is
MIT. Full credits are in `android/THIRD_PARTY_NOTICES.md`.

This is a reversal that deserves an explicit decision. In 0.4 the clarinet was
deliberately *excluded* over its non-commercial licence, and
`android/scripts/validate-assets.py` still enforces that policy — it fails unless the
clarinet is listed as an excluded model. In 0.5 the clarinet was bundled anyway, on
the premise stated in `android/MODEL_MANIFEST.md` that "this packaged source handoff
is treated as a free non-commercial release artifact."

So `android/static-check.sh` currently fails on that validator, by design. The gate is
left as-is rather than quietly updated, because passing it means committing Bocal to a
non-commercial release. If Bocal is ever to be sold or monetised, the clarinet model
must be removed or relicensed.

## The v6 source

`web-source-v6/` is the one part of the import that is not a subset of the 0.2
handoff. It diverges from `web-source/`: it adds `app/alto-sax-model.ts`,
`app/sax-setup-data.ts`, an `examples/d1` directory and a `sax-data.test.mjs` test,
and it drops `drizzle/` and `public/`. Its README is still un-customized
vinext-starter boilerplate, so treat it as work in progress rather than a finished
successor. Reconciling it with `web-source/` is an open task.

## Provenance

Imported from `Bocal_COMPLETE_ChatGPT_Bundle_2026-08-12`. All 551 bundle checksums
verified before import.

The bundle shipped eight package snapshots, six of which were byte-identical subsets
of the complete handoff (`android`, `models`, `research`, `web-standalone`, the
static ready-to-host build, and the hosted-sites source fix). Those duplicates and
the original ZIPs were dropped in favor of a single de-duplicated tree; every unique
file is preserved. `docs/Import_Bundle_Manifest.md` and
`docs/Bocal_0.2_Handoff_README.md` retain the original manifests.

Personal saxophone reference photographs and two user-supplied motion-reference
videos were excluded upstream as source inputs rather than publishable artifacts.
