# Importing a new 3D reference model

This is the checklist for adding a third licensed instrument model (the
flute candidate below, or any future one) alongside the alto saxophone and
oboe. It captures what `3d-customization.md` found while investigating the
scale bug and the two shipped models' segmentation.

## 1. Licence and provenance first

Confirm the source licence permits Bocal's use (CC BY 4.0 has covered both
shipped models) and record author, source URL and licence in
`public/models/ATTRIBUTION.md` before the binary is committed.

## 2. Inspect before optimizing

Parse the GLB's JSON chunk (node/mesh/material counts, per-mesh bounding
boxes from accessor min/max transformed by each node's world matrix) before
touching the binary. The review that flagged the scale bug did this with a
small standalone script; there is no such tool checked into `scripts/` yet,
so write one (or extend `optimize-model.mjs`) rather than guessing at the
file's structure from the loaded three.js scene. Note:

- **Long axis.** `ImportedInstrumentCanvas` normalises on the *largest*
  bounding-box extent (fixed as part of the P0 scale bug), not a fixed axis,
  so a horizontally-authored model (most flutes) is safe -- but still verify
  the after-normalisation size with `tests/model-render.test.mjs`'s replay
  fixture before wiring it into a lab.
- **Ancestor scale/rotation.** If the model isolates one root node out of a
  larger scene (as the oboe's Sketchfab export did), make sure the isolation
  step preserves the ancestor chain's scale -- `scene.attach()` before
  measuring, never `scene.add()` before measuring.
- **Segmentation.** Count distinct meshes/materials per functional part
  (body, keys, pads, cork, embouchure plate). The flute candidate (Sketchfab
  uid `08cb4375f9924366b725c439fd6163a8`) reports 6 materials against the
  sax's 4 and the oboe's 2 -- confirm on download whether that maps to
  body/keys/pads/cork before assuming it.

## 3. Write the parts sidecar

Add `public/models/<model>.parts.json` in one of the two shapes already in
the repo:

- an explicit per-mesh table (`saxophone-alto.parts.json`) when meshes are
  few and named usefully, or
- an ancestor rule (`oboe-howarth-s20c.parts.json`) when classification is
  cheaper by walking to a named parent group.

`classifySaxPart` / `classifyOboePart` in `app/model-looks.ts` show the two
patterns in code; a third model gets its own `classify<Model>Part` function
built the same way, not a new heuristic.

## 4. Own camera presets

`VIEW_POSITIONS` in `ImportedInstrumentCanvas.tsx` assumes a tall instrument
framed front/left/right/back. A flute (or anything authored on its side)
needs its own preset positions -- do not reuse the sax/oboe numbers.

## 5. Product copy moves in lockstep

`instruments.ts` and `InstrumentExperience.tsx` currently say the flute has
"no 3D model yet" and `tests/product-truth.test.mjs` pins that string. When a
flute model ships, update the flute's `labTier` and the pinned string
together in the same change -- every other chart-only instrument (bassoon,
etc.) keeps the string as-is.

## 6. Size budget

Check the preview bundle and `app.html` size after inlining (both base64
GLBs already account for most of `preview-dist/index.html`). If the legacy
Android lab assets are still shipped (see `3d-customization.md` finding 5),
remove those first -- they free far more space than a new model costs.
