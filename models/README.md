# Bocal educational 3D woodwind pack

This pack contains 35 compact binary glTF (`.glb`) models and the Python generator that produced them. They are original, intentionally simplified teaching geometry—not scans, manufacturer designs, repair references, or CAD. Their purpose is to show recognizable silhouette, part order, tone-hole/key location, hand topology, and selectable controls without looking like toy caricatures.

## Coverage

- 10 saxophones: soprillo, sopranino, soprano, alto, C melody, tenor, baritone, bass, contrabass, and subcontrabass
- 4 flutes: piccolo, concert, alto, and bass
- 8 clarinets: E-flat, B-flat, A, basset horn, alto, bass, contralto, and contrabass
- 6 double reeds: oboe, oboe d'amore, English horn, bass oboe/heckelphone, bassoon, and contrabassoon
- 7 recorders: sopranino through contrabass

`catalog.json` is the integration contract. `transpose` is the number of semitones from written pitch to sounding/concert pitch: for example, alto sax is `-9`, E-flat clarinet is `+3`, and piccolo is `+12`.

Every selectable node starts with `key__` or carries `extras.interactive = true`; `extras.keyId`, `label`, `finger`, `side`, and `partType` support teaching overlays. The alto saxophone has 22 named controls and a separate core written B-flat 3 through F6 note map in the app source. The baritone model includes a distinct low-A control.

## Validation status

The geometry and metadata are build-validated, not pedagogy-certified. Only the alto sax core chart is wired to note-level fingering in this release. Alternate, trill, bis variants, front fingerings, altissimo, manufacturer-specific mechanisms, and the other instruments' note maps require review by a qualified player/teacher for each family. The catalog records this status so a UI can avoid showing unverified claims.

Run:

```bash
python3 generator/generate_models.py
python3 validate_models.py
```

The validator checks GLB structure, catalog/file agreement, root metadata, interactive-control counts, and named-control uniqueness.

## License

The generated assets and generator are supplied under CC BY 4.0. See `LICENSE-ASSETS.md`. Third-party trademarks and manufacturer trade dress are not included.
