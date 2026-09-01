# Bocal product state — 28 August 2026

## Current visual direction

The navigation is a true mobile-derived arc rather than a desktop sidebar:

- Narrow portrait uses the curved bottom dock.
- Wide/landscape uses the same five-action dock as a vertical side arc.
- Settings preserve the player’s left/right landscape preference locally.
- Instrument selection and feature cards use cinematic, image-led tiles.

## Completed on this branch

- Claude’s saxophone-family fingering extension remains intact for soprano, alto, tenor and baritone saxophone, including written-pitch offsets.
- Guitar is now a first-class instrument with Standard, Drop D and Open G tuning options.
- The guitar view includes an open-string tuner, microphone listening state, colour-coded chord diagrams and a paced four-chord player.
- The chord player can wait for three stable root-note frames before advancing; it does not claim to recognise a full strummed chord.
- Practice activity records locally by type, day and note. Practice now shows a weekly day distribution, activity-type bars, note evidence, a gentle progress nudge and a title-only song wishlist.
- Wishlist data is local and exportable, but Bocal does not ship unlicensed scores, tabs, recordings or backing tracks.

## Validation boundary

Static regression coverage, the repository’s existing web checks, and source contracts cover the new integrations. Visual layout still needs browser/device review at desktop, tablet, landscape and phone sizes; acoustic claims need physical-device testing. This document does not turn a passing web build into instrument-accuracy or hardware-performance certification.

## Known gaps

- No accurate imported guitar 3D model; the guitar learning view intentionally uses a 2D diagram until a licensed, validated model and fingering map exist.
- Chord progression gating detects a stable monophonic root, not a complete strummed chord.
- No score renderer, chart importer, licensed song catalogue, backing tracks or bar-level repertoire player.
- No functional coach assignment/review system; see `COMPETITIVE_PARITY_AND_COACH_AUDIT_2026-08-27.md` for the required workflow.
- TE-grade professional tuner/metronome/recording/analysis controls and physical-device validation remain incomplete.
- Android parity for the new guitar/practice functionality remains to be implemented and tested.
