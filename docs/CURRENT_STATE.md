# Bocal — current state

An instrument × capability table, kept as the one place other docs point to instead
of restating instrument counts and feature lists that drift out of date. Generated
by hand from `web-source/app/instruments.ts` and the fingering/sax-lab/oboe-lab
review reports as of 6 September 2026; re-check it whenever `INSTRUMENT_ORDER` or a
`labTier` changes.

## Instrument × capability

| Instrument | `labTier` | Tuner | Written↔concert offset | Lab | Known chart/model issues |
|---|---|---|---:|---|---|
| Alto saxophone | fingering | Yes | 9 semitones | 3D fingering trainer, licensed model | Standard range only; altissimo B6/C7 fingerings not confirmed against the cited source |
| Tenor saxophone | fingering | Yes | 14 semitones | Fingering trainer, shown on alto model | Standard range only |
| Soprano saxophone | fingering | Yes | 2 semitones | Fingering trainer, shown on alto model | Standard range only |
| Baritone saxophone | fingering | Yes | 21 semitones | Fingering trainer, shown on alto model | Standard range only, no low A |
| Oboe | anatomy | Yes | 0 | 3D anatomy preview + 2D chart | D6 fingering shown with RH1 pressed, contradicting the cited source; renderer has a known 100x scale bug |
| Cor anglais | anatomy | Yes | 7 semitones | 3D anatomy preview (oboe model) + oboe chart | Picker range starts one semitone too low (written B♭3 instead of B3) |
| Flute | chart | Yes | 0 | 2D fingering chart, no 3D model | Thumb B♭ and E♭ key omissions against the cited source |
| Clarinet | chart | Yes | 2 semitones | 2D fingering chart, 3D model not licensed | Chart verified against the source; considered the most reliable of the three chart-only instruments |
| Bassoon | chart | Yes | 0 | 2D fingering chart, no 3D model | Missing LH pinky keys against the cited source |
| Guitar | none | String tuner (no reed/embouchure model) | n/a | Chord fretboard chart + follow player | Follow-player advance is now tempo-selectable and scheduled on the AudioContext clock (fixed alongside this document) |

## Cross-cutting state

| Area | State |
|---|---|
| Fingering/anatomy review | None reviewed by a qualified teacher; every chart and the sax altissimo set carry a "not yet teacher-reviewed" badge |
| 3D rendering | Uniform bronze study finish on both licensed models; no per-instrument material/finish customization reaches the model yet |
| Takes/recordings (Analyze) | Kept in memory for the session; not persisted to disk; download is the only way to keep one |
| Practice data | Local `localStorage`, deterministic skill-rating from recorded evidence (no synthetic/demo numbers) |
| Android shell | WebView wrapper over this web build; two third-party glTF models ship (alto sax, oboe); no signed release build exists |
| Tests | `product-truth.test.mjs` and `human-copy.test.mjs` assert the claims above at the source-file level; keep both passing when copy changes |

## Where the fuller detail lives

- Instrument and lab-tier source of truth: `web-source/app/instruments.ts`.
- Fingering chart data and per-instrument fixtures: `web-source/app/fingering-charts/`.
- Full narrative handoff: `docs/BOCAL_HANDOFF.md`.
- Detailed, cited findings per subsystem: the review reports (`tuner.md`,
  `fingering-charts.md`, `sax-lab.md`, `3d-customization.md`, `light-theme.md`,
  `product.md`, `android-ci.md`, `engineering.md`, `a11y-ux.md`, `analysis.md`,
  `metronome.md`, `tone-generator.md`) alongside this file's source, and the
  work-package plan (`PLAN.md`) that tracks which findings have been fixed.
