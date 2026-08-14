# Bocal Android 0.5 — Model Manifest

## Runtime policy

Only detailed models with usable provenance and acceptable runtime boundaries are shipped. A model being visually detailed does **not** automatically authorize fingering claims.

| Runtime ID | Instrument | Source type | License | Product status |
|---|---|---|---|---|
| `alto-sax` | Modern E-flat alto saxophone | Licensed detailed reference | CC-BY-4.0 | Validated fingering graph over detailed mesh |
| `oboe` | Howarth Conservatoire S20C | Licensed detailed reference | CC-BY-4.0 | Anatomy/part inspector only |
| `clarinet` | Clarinet model with annotations | Licensed detailed reference | CC-BY-NC-4.0 | Anatomy/part inspector only for free non-commercial Bocal packaging |

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

## Clarinet

**Credit:** `Clarinet model (with annotations)` by Henry Chi, licensed under CC-BY-NC-4.0. License text: `app/src/main/assets/www/licenses/clarinet-CC-BY-NC-4.0.txt`.

The clarinet model is bundled in 0.5 because this packaged source handoff is treated as a free non-commercial release artifact.

**Enabled:** orbit, four views, part selection, temporary highlighting, source credit, model preview inside the shared Lab shell.

**Disabled:** note-to-fingering, fingering-to-note, educational linkage claims, and any commercial redistribution claim under this license.

## Excluded detailed candidates

### Other saxophone archives

Redundant or lower-signal saxophone archives were not selected. Bocal uses one detailed CC-BY source plus its separate validated control graph instead of shipping multiple conflicting instrument representations.

### Legacy generated woodwinds

The procedural 35-model family from earlier reference builds remains historical prototype evidence only and is not treated as runtime truth.
