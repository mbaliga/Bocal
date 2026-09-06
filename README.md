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
| `android/` | Android WebView shell (version 0.6.0, versionCode 7) hosting `web-source`'s app verbatim — see [Android and model licensing](#android-and-model-licensing). |
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

- **No signed release APK/AAB is included.** `android/` now builds and passes
  `assembleDebug`/`assembleRelease` locally (R8 verified) and CI produces a debug APK
  on every push, but a Play-acceptable signed AAB requires the upload-keystore
  secrets named in `android/README.md`, which do not exist in this repository.
  `android/build-apk.sh`, `verify-apk.sh` and `device-release-check.sh` document the
  remaining device-validation pass.
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

## Android and model licensing

`android/` is now a thin WebView shell (`MainActivity` -> `WebAppScreen`) that hosts
`web-source`'s app verbatim from a bundled `assets/www/app.html`; the six-workspace
native Compose UI, its five audio engines and the separate in-app 3D Lab
(`assets/www/lab.html`, a vendored Three.js runtime and duplicate glTF model trees)
described in earlier versions of this document have been deleted as dead code —
nothing reachable from `MainActivity` ever loaded them, and removing them took the
debug APK from ~34 MB to ~19 MB. `INTERNET` is still deliberately absent;
`RECORD_AUDIO` and `VIBRATE` remain the only permissions, and `allowBackup` is now
`false`.

The web app's own saxophone and oboe 3D labs inline **two** detailed third-party
glTF models (alto sax, Howarth oboe) as base64 inside `app.html` — see
`web-source/public/models/ATTRIBUTION.md` for licences and credits. The clarinet
model referenced in earlier drafts of this repository was CC-BY-NC-4.0 (no
commercial use) and is not shipped.

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
