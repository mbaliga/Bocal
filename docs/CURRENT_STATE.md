# Bocal — current state

An instrument × capability table, kept as the one place other docs point to instead
of restating instrument counts and feature lists that drift out of date. Generated
by hand from `web-source/app/instruments.ts` and the fingering/sax-lab/oboe-lab
source fixtures as of 18 September 2026; re-check it whenever `INSTRUMENT_ORDER`
or a `labTier` changes.

## Instrument × capability

| Instrument | `labTier` | Tuner | Written↔concert offset | Lab | Known chart/model issues |
|---|---|---|---:|---|---|
| Alto saxophone | fingering | Yes | 9 semitones | 3D fingering trainer, licensed model, with a 2D chart beneath the stage synced to the note browser | Standard range only; altissimo B6/C7 fingerings not confirmed against the cited source |
| Tenor saxophone | fingering | Yes | 14 semitones | Fingering trainer, shown on alto model | Standard range only |
| Soprano saxophone | fingering | Yes | 2 semitones | Fingering trainer, shown on alto model | Standard range only |
| Baritone saxophone | fingering | Yes | 21 semitones | Fingering trainer, shown on alto model; low A3 on the 2D chart | Low A3 is a baritone-only fingering (scoped in `sax-data.ts`); the alto model has no such key, so the lab says so plainly |
| Oboe | anatomy | Yes | 0 | 3D anatomy preview + 2D chart | D6 fingering remains unreviewed against the cited source; renderer scale regression is covered by `model-render.test.mjs` |
| Cor anglais | anatomy | Yes | 7 semitones | 3D anatomy preview (oboe model) + oboe chart | Borrowed chart is trimmed to written B3 and above; specialist review remains outstanding |
| Flute | chart | Yes | 0 | 2D fingering chart, no 3D model | Thumb B♭ and E♭ key omissions against the cited source |
| Clarinet | chart | Yes | 2 semitones | 2D fingering chart, 3D model not licensed | Chart verified against the source; considered the most reliable of the three chart-only instruments |
| Bassoon | chart | Yes | 0 | 2D fingering chart, no 3D model | Missing LH pinky keys against the cited source |
| Guitar | none | String tuner (no reed/embouchure model) | n/a | Chord fretboard chart + follow player | Follow-player advance is tempo-selectable and scheduled on the AudioContext clock |
| Vocal | vocal | Yes | 0 | Three-step self-paced warm-up with pause/resume timer and local completion log | Pitch-first support only; no vocal-technique grading or healthy-range claim; voice-teacher and device review remain |

## Wave 2 (merged 18 September, PR #18) -- present in the code

| Package | State |
|---|---|
| W2-A tuner | `page.tsx` composes `useTuner`, `usePersistedSetting`, `TunerView`, `DownloadCenter` and `storage-keys.ts` (every localStorage key is a named constant; a test enforces it). Manual target-note lock, pitch pipe (press and hold the readout), written/concert readout toggle, dBFS level meter with peak hold and clip indicator, tenth-of-a-cent tracking at Ultra precision, and the tone generator's "Follow my pitch" wired to the live locked reading |
| W2-B analyze | Spectrogram mode, A/B take overlay, take tags/notes with sort and filter, MIDI and MusicXML transcription export |
| W2-C practice | Shared audio scheduler, metronome gap drill and seeded beat drops, exercise library in the tone generator, per-session practice log with rename and delete (`PracticeLog`, `updatePracticeActivity`, `deletePracticeActivity`) |
| W2-E models | Alto body re-segmented into neck/body/bow/bell and oboe body split into top joint/lower joint/bell (`public/models/*.parts.json`, modifications recorded per CC BY 4.0) |
| Sax lab | 2D chart under the 3D stage, `SAX_3D_KEYS` (the baritone low A key is not drawn on the alto model), baritone low-A notice |

## After wave 2: October additions

- Vocal instrument profile: `labTier: "vocal"`, `embouchure: "voice"`, 80-1400 Hz tracker band, `VocalStudio.tsx` three-step warm-up logged as a `vocal` practice activity; competitor scope in `docs/VOCAL_COMPETITOR_ANALYSIS.md`.
- Flute coaching direction (`CORRECTION_COPY["air-reed"]`): rolling in covers more of the hole and lowers pitch, so a sharp flute rolls in and a flat flute rolls out.
- Android `beta` flavour (the only variant with the INTERNET permission, for the optional local session bridge); the standard flavour stays offline-only.
- Release workflow gates and `android/verify-aab.sh`; CC BY 4.0 licence-text links beside both model credits.

## Cross-cutting state

| Area | State |
|---|---|
| Fingering/anatomy review | None reviewed by a qualified teacher; every chart and the sax altissimo set carry a "not yet teacher-reviewed" badge |
| 3D rendering | Bronze is the default; the Look panel applies local material, keywork, mouthpiece, environment and camera controls without changing geometry |
| Takes/recordings (Analyze) | IndexedDB-backed local persistence when available, with a session-only fallback; no uploads |
| Practice data | Local `localStorage`, deterministic skill-rating from recorded evidence (no synthetic/demo numbers) |
| Android shell | WebView wrapper over this web build; two third-party glTF models ship (alto sax, oboe); no signed release build exists |
| Tests | Source tests cover product truth, chart invariants, model scale, and local persistence; `test:e2e` and `test:theme` are explicit browser gates |

## Where the fuller detail lives

- Instrument and lab-tier source of truth: `web-source/app/instruments.ts`.
- Fingering chart data and per-instrument fixtures: `web-source/app/fingering-charts/`.
- Full narrative handoff: `docs/BOCAL_HANDOFF.md`.
- Detailed implementation evidence: `web-source/tests/`, `android/static-check.sh`,
  `android/device-release-check.sh`, and `android/verify-aab.sh`. The remaining
  release gates are physical-device testing, teacher review, model-license
  confirmation, and a real signed Play bundle.
