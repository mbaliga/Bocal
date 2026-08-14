# Bocal Android 0.5 changelog

## UX / information architecture

- Rebuilt the bottom navigation as a floating two-tier dock inspired by the provided reference.
- Restored the six-workspace layout: Tune, Lab, Sound, Pulse, Analyze, Practice.
- Added a shared instrument context selector for Alto, Oboe and Clarinet.
- Upgraded screens with richer hero cards and more visual card surfaces.

## Instrument lab

- Added Clarinet to the runtime catalog.
- Wired the Lab WebView to open the selected instrument directly.
- Expanded the shared anatomy-preview shell so both Oboe and Clarinet use the same part-inspector pattern.

## Runtime assets and documentation

- Bundled clarinet model files and attribution.
- Updated model manifest and third-party notices.
- Added `docs/Bocal_0.5_UI_System.md` documenting navbar behavior, component rules, clarinet rules, image/card system, and screen updates.

## Versioning

- Updated app version to `0.5.0`.

## Post-import amendment — clarinet removed

The clarinet model shipped in the original 0.5 archive is licensed CC-BY-NC-4.0,
which forbids commercial use. Bundling it reversed a deliberate 0.4 decision to
exclude it, and `scripts/validate-assets.py` still enforced that exclusion, so the
source failed its own gate.

Bocal is kept commercially licensable, so the clarinet was removed: model, textures
and licence text deleted; the runtime catalog entry dropped and the instrument
returned to `excludedModels`; the `CLARINET` profile removed from the Compose shell;
and the Lab's clarinet copy branches collapsed to the oboe path.

The Lab therefore ships two detailed instruments — alto sax and Howarth oboe — both
CC-BY-4.0. `static-check.sh` passes end to end.
