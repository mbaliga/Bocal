# Bocal Android 0.5 — Model Manifest

## Runtime policy

Only detailed models with usable provenance and acceptable runtime boundaries are shipped. A model being visually detailed does **not** automatically authorize fingering claims.

| Runtime ID | Instrument | Source type | License | Product status |
|---|---|---|---|---|
| `alto-sax` | Modern E-flat alto saxophone | Licensed detailed reference | CC-BY-4.0 | Validated fingering graph over detailed mesh |
| `oboe` | Howarth Conservatoire S20C | Licensed detailed reference | CC-BY-4.0 | Anatomy/part inspector only |

## Alto saxophone

**Credit:** `saxophone alto` by ANDRIANIAINAToky, licensed under CC-BY-4.0. License text: `app/src/main/assets/www/licenses/saxophone-alto-CC-BY-4.0.txt`.

**What Bocal validates:**

- 23 distinct player touch-pieces in the control graph;
- primary chromatic written fingerings B-flat3 through F-sharp6;
- documented alternate routes in the source baseline;
- written-to-concert transposition convention for E-flat alto;
- explicit finger-contact versus remote-pad/mechanism semantics.

**What the mesh does not prove:** service-CAD dimensions, exact manufacturer geometry, specialist trill/microtonal/multiphonic routes, or human certification of every projected overlay location.

## Oboe

**Credit:** `Oboe - Howarth Conservatoire S20C (Instrument)` by WarderiiK, licensed under CC-BY-4.0. License text: `app/src/main/assets/www/licenses/howarth-s20c-CC-BY-4.0.txt`.

The model is used as a high-detail anatomy reference.

**Enabled:** orbit, four views, part selection, temporary highlighting, mesh inspection, source credit.

**Disabled:** note-to-fingering, fingering-to-note, educational linkage claims.

## Excluded detailed candidates

### Clarinet model (with annotations)

`Clarinet model (with annotations)` by Henry Chi is licensed CC-BY-NC-4.0, whose
NonCommercial term forbids commercial use.

The original 0.5 source bundled it, on the premise that the handoff was a free
non-commercial release artifact. That premise was not adopted: Bocal is kept
commercially licensable, so the model, its textures and its licence text were removed
and the instrument returned to this exclusion list — the position 0.4 held.

Restoring a clarinet to the Lab means sourcing a model whose licence permits
commercial use, not reinstating this one.

### Other saxophone archives

Redundant or lower-signal saxophone archives were not selected. Bocal uses one detailed CC-BY source plus its separate validated control graph instead of shipping multiple conflicting instrument representations.

### Legacy generated woodwinds

The procedural 35-model family from earlier reference builds remains historical prototype evidence only and is not treated as runtime truth.
