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
| `android/` | Kotlin/Jetpack Compose Android Studio project with the static 3D lab embedded as local assets. |
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
carries over to this import. `qa/VERIFICATION.md` is the authoritative record.

**Verified:** the Vite build and its smoke suite pass; all 35 GLBs parse as glTF 2.0
and agree with the catalog, with 465 named interactive controls validating; the
Android asset bundle matches the standalone build; the 27-page handoff was rendered
and reviewed page by page.

**Not verified:**

- **No APK is included, and none has been built.** `android/` is source intended to
  build one, but it still needs a real Android Studio/SDK compile, unit-test, install
  and device-validation pass. `android/build-apk.sh` and `verify-apk.sh` document that path.
- **The 3D models are educational reference geometry, not repair or CAD models.**
  Only the alto saxophone has a core note map. Other instruments expose recognizable
  parts and controls but must not be presented as certified fingering tutors until
  family specialists approve their note maps and mechanisms.
- Microphone accuracy, latency, octave errors, metronome long-run drift and
  battery/thermal behavior are untested — they need labeled audio fixtures and
  representative devices.
- WebGL appearance was never confirmed in a real browser; the build environment's
  WebGL process failed. Physical-browser QA remains an open gate.
- Any claim of parity with or superiority to TonalEnergy is unproven, and would
  require moderated matched-task studies on a shared device and audio corpus.

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
