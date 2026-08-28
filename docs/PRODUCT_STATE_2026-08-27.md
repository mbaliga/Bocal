# Bocal product state — 27 August 2026

## Current visual direction

The navigation has been restored as a true arc rather than a desktop sidebar:

- Narrow portrait uses the curved bottom dock.
- Wide/landscape uses the same five-action dock as a vertical side arc.
- Settings preserve the player’s left/right landscape preference locally.

Feature tiles are image-led and use the existing cinematic asset family. This pass adds a focused guitar studio rather than a generic utility card: the tuner, chord placement, colour legend and follow player share one dark, tactile visual system.

## Validation boundary

The source compiles and automated tests can validate routes, strings and persistence contracts. Visual layout still needs browser/device review at desktop, tablet, landscape and phone sizes; acoustic claims need physical-device testing. This document does not turn a passing web build into an instrument-accuracy or hardware-performance certification.

## Known gaps

- No complete native Android parity for this new guitar/practice functionality.
- No accurate imported guitar 3D model; the guitar learning view intentionally uses a 2D diagram until a licensed, validated model and fingering map exist.
- Chord progression gating detects a stable monophonic root, not a complete strummed chord.
- No score renderer, chart importer, licensed song catalogue, backing tracks or bar-level repertoire player.
- No functional coach assignment/review system; see the competitive/coach audit for the required workflow.
- TE-grade professional tuner/metronome/recording/analysis controls and device validation remain incomplete.
