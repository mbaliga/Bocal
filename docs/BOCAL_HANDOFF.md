# Bocal product and engineering handoff

**Version:** 2.0
**Date:** 6 September 2026
**Status:** Active prototype; not yet TonalEnergy feature parity, not yet teacher-reviewed
**Current public instruments:** Ten — see the table in §2. Nine woodwinds (alto/tenor/soprano/baritone saxophone, oboe, cor anglais, flute, clarinet, bassoon) plus guitar.
**Product principle:** local-first, educationally honest, usable in one or two taps during real practice

This is the single canonical handoff document. `web-source/public/downloads/BOCAL_HANDOFF.md`
is the copy served in-app from Settings → Download and must always match this file.
Any other file named `BOCAL_HANDOFF.md` elsewhere in the repository is stale and
should not be trusted.

## 1. What Bocal is

Bocal is a local-first practice companion for music learners, teachers and working
musicians: a dependable tuner, rhythm and practice workspace with instrument-specific
learning content, run entirely in the browser (or an Android WebView shell) with no
account and no network calls beyond loading the app itself.

## 2. Instrument support

All ten rows below are selectable in the instrument picker today; none are
placeholders. `labTier` in `web-source/app/instruments.ts` drives what each
instrument's second workspace tab shows.

| Instrument | Pitch | Tuner | Lab (`labTier`) |
|---|---|---|---|
| Alto saxophone | E♭ | Yes | 3D fingering trainer on the licensed alto model |
| Tenor saxophone | B♭ | Yes | Fingering trainer, shown on the alto model, standard range only |
| Soprano saxophone | B♭ | Yes | Fingering trainer, shown on the alto model, standard range only |
| Baritone saxophone | E♭ | Yes | Fingering trainer, shown on the alto model, standard range only, no low A |
| Oboe | C | Yes | 3D anatomy preview + 2D fingering chart |
| Cor anglais | F | Yes | 3D anatomy preview shown on the oboe model + oboe fingering chart |
| Flute | C | Yes | 2D fingering chart, no 3D model |
| Clarinet | B♭ | Yes | 2D fingering chart, 3D model not licensed |
| Bassoon | C | Yes | 2D fingering chart, no 3D model |
| Guitar | — | String tuner | Chord fretboard chart + a follow player that waits for the played root |

**Every fingering chart and the saxophone altissimo set are badged "not yet
teacher-reviewed"** — they are checked against two published references
(the Woodwind Fingering Guide and a second method-book source), which is a lower bar
than a qualified player's review. See `docs/CURRENT_STATE.md` for the full
instrument × capability matrix and known data gaps per instrument.

## 3. What each workspace does

- **Tune** — confidence-gated chromatic pitch detection (YIN-based), written/concert
  pitch display honoring each instrument's transposition, 11 built-in temperaments
  plus a custom temperament editor, adjustable reference pitch, sensitivity/damping
  presets, a 10-second pitch history (line or staff view), and a calibrated
  reference-tone generator with selectable waveform and precision.
- **Lab** (label varies by instrument tier) — the sax family's interactive 3D
  fingering trainer on a licensed alto model with key-glow; the oboe's 3D anatomy
  preview; 2D fingering charts for flute, clarinet and bassoon (and as a second view
  for oboe/cor anglais); the guitar's chord fretboard and follow player.
- **Pulse** — metronome with tap tempo, count-in, click voice options, silent-bar
  drills, saved presets and multi-section sequences, plus a drone.
- **Analyze** — live waveform and spectrum views, a harmonics/partial-level overlay,
  and named multi-take recording with import, loop, tempo playback, rename, delete
  and download. Takes are kept in memory for the session unless downloaded; the app
  does not persist recordings to disk on its own.
- **Practice** — local practice-time logging, weekly goals, a streak indicator,
  lesson/setup notes, deterministic (non-random) skill-rating evidence, and a coach
  board covering pitch, rhythm, technique, repertoire and reflection with an
  exportable brief.

## 4. Known gaps (do not ship copy that contradicts these)

This section exists so the handoff cannot drift out of sync with reality the way its
predecessors did. It is not exhaustive — see the individual review reports under
`review/` for full detail with file:line citations.

- No fingering chart or altissimo fingering has been reviewed by a qualified teacher.
- Several charts (flute, bassoon, oboe) have documented data errors against the cited
  source; see `fingering-charts.md`.
- The tuner's pitch tracker is tuned to a single frequency range that clips some
  instruments' extremes (e.g. bassoon's first octave); see `tuner.md`.
- The 3D models render a uniform bronze study finish; no per-instrument
  customization (finish, environment, camera preset) reaches the model yet.
- Takes recorded in Analyze are session/in-memory only, not saved to persistent
  storage, despite earlier drafts of this handoff and the privacy policy implying
  otherwise.
- The Android shell is a WebView wrapper over this web build (`MainActivity` →
  `WebAppScreen`), not a native Kotlin/Compose UI; no signed release build exists yet.

## 5. Technical architecture

- **Web app** (`web-source/`): Next.js/vinext, React, TypeScript, Three.js for the 3D
  labs. Client-only rendering for the 3D canvas; everything else is a normal React
  tree. No server-side state — all persistence is `localStorage`/IndexedDB in the
  visitor's own browser.
- **Android** (`android/`): a thin native shell. `MainActivity` sets content to
  `WebAppScreen()`, a WebView loading this app's static build from
  `appassets.androidplatform.net` (so `getUserMedia` works without cleartext
  traffic). Compile/target SDK 37. Permissions: `RECORD_AUDIO` and `VIBRATE` only —
  no `INTERNET`. Two third-party glTF instrument models ship in
  `android/app/src/main/assets/www/models` (alto sax, oboe); see
  `android/THIRD_PARTY_NOTICES.md` and `android/MODEL_MANIFEST.md` for licensing.
  The earlier native Kotlin/Compose screens remain in the source tree only as an
  unused revert path.
- **Build/verification**: `npm run lint`, `npx tsc --noEmit`, `npm run build`,
  `node --test tests/*.test.mjs`, `npm run preview:standalone`. See
  `web-source/README.md` for the exact commands.

## 6. Release status

No signed Android release build exists. `android/fastlane/` and `docs/store/`
describe the intended Play Store listing and privacy policy; both should be
re-checked against §4 before any store submission, since store copy has previously
overclaimed relative to what ships (see `product.md` and `android-ci.md` in
`review/`).

## 7. Personas and core workflows

- **Beginner woodwind/guitar student** — picks their instrument once in onboarding,
  tunes before every practice session, and leans on the fingering chart or 3D lab
  when a new note comes up in a lesson.
- **Returning intermediate player** — uses Pulse sequences and Practice logging to
  structure a session, checks Analyze's harmonics/spectrum view to hear intonation
  drift, and reviews the Practice streak and coach board weekly.
- **Teacher/coach** — uses the coach board to leave notes across pitch, rhythm,
  technique, repertoire and reflection, and exports a brief for a student; does not
  yet have a way to review or correct the shipped fingering data in-app (that stays a
  code change today — see §4).
- **Casual/curious visitor** — opens the instrument gallery, browses the Woodwinds
  and Strings sections and the further-planned families, and may leave without an
  account, which the app supports (no sign-in exists at all).

Each persona's workflow is a straight-line loop: pick an instrument once, then tune,
learn, keep time and review, all inside one browser tab with no server round-trip
beyond the initial page load.

## 8. Capability requirements this handoff assumes

- **Local-first**: every feature above must work with the microphone and the current
  page's `localStorage`/IndexedDB only; no feature should require an account or a
  network request to function.
- **Instrument-honest**: an instrument's lab tier, tuner correction copy and
  onboarding copy must describe what that specific instrument actually has, not a
  generic "every instrument gets a 3D model" assumption. This was violated before
  the 6 September review (`product.md` findings on the "3D lab" tab name, onboarding
  step 2/3 copy, and the guitar sharing the sax family's embouchure correction
  copy) and is being corrected package by package; check `docs/CURRENT_STATE.md` for
  what has landed.
- **Reviewable data**: any musical claim (a fingering, an altissimo note, a
  temperament's cent values) must be traceable to a cited source and badged
  accordingly, never presented with more confidence than a teacher's sign-off would
  imply.

## 9. Build, packaging and current release path

No signed Android release build has been produced. The web app builds via
`npm run build` (Next.js) and has a static "standalone" export path
(`npm run preview:standalone`) that the Android WebView shell is meant to serve.
`android/fastlane/` scaffolds a Play Store submission (title, short/full
description, changelogs) but the changelog for the currently tagged versionCode
predates several shipped features — see §4 and `android-ci.md` in `review/` for the
exact string-level mismatch and the fix (regenerate the bundled WebView asset from
`preview:standalone` rather than hand-copying it).

## 10. QA and release gates

Before any Android release is promoted beyond internal testing:

1. `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the full
   `node --test tests/*.test.mjs` suite must pass with zero regressions.
2. A Playwright pass over the onboarding flow, the instrument picker, and every
   `labTier` in both light and dark theme, at a phone viewport, with zero
   `pageerror` events and no horizontal overflow.
3. A physical-device pass: microphone latency and accuracy, screen-lock behavior
   while the tuner or metronome is running, and status-bar/theme sync, none of
   which are exercised by the emulator-only checks above.
4. A named, qualified reviewer's sign-off on at least the flute, clarinet and
   bassoon fingering charts before removing the "not yet teacher-reviewed" badge
   from any of them.

## 11. Open decisions

- Whether guitar belongs in an otherwise woodwind-focused app long-term, or should
  be reframed as the first of a broader "strings" section (see the picker's
  Woodwinds/Strings split introduced alongside this handoff).
- Whether the Android shell should keep the click running in the background while
  microphone capture stops (current default), or match the metronome's behavior to
  the tuner's.
- Whether to invest further in the current bronze-study 3D finish and per-instrument
  material customization, or prioritize teacher review of the 2D chart data first.

## 12. Provenance

This repository also contains an earlier 0.2–0.5 import snapshot
(`web-standalone/`, `web-source-v6/`, `models/`, `research/`, `qa/`) that predates
the current instrument set and is not part of the live product; see the top-level
`README.md` for that history. `web-source/` is the only actively developed product
surface this handoff describes.
