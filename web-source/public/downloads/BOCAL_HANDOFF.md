# Bocal product and engineering handoff

**Version:** 1.7
**Date:** 17 August 2026  
**Status:** Active prototype; not yet TonalEnergy feature parity  
**Current public instruments:** E♭ alto saxophone learning lab; C oboe anatomy preview  
**Product principle:** local-first, educationally honest, usable in one or two taps during real practice

## 1. Executive handoff

Bocal is a local-first practice companion for music learners, teachers and working musicians. The near-term product is not “another attractive tuner.” It is a dependable tuner, rhythm and practice workspace with instrument-specific learning that general-purpose incumbents do not center.

The public web implementation currently contains:

- a confidence-gated chromatic tuner with E♭ alto and concert-pitch oboe modes;
- a metronome, tap tempo and drone workspace;
- live waveform and spectral-energy views plus local take recording/download;
- local practice planning, lesson/equipment notes and deterministic skill evidence;
- a complete keyed-range alto fingering dataset from written B♭3 through F♯6;
- a licensed detailed alto reference mesh with 23 interactive educational touch targets aligned directly over the instrument;
- one unified fingering experience: selected contacts glow directly on the instrument, optional available targets can be revealed, and the side panel explains linked pad motion;
- an unobstructed model viewport with controls in an external experience dock and a full-screen focus mode;
- a uniform bronze study finish across imported learning models, with bright keywork and a neutral studio stage for reliable contrast;
- a coherent seven-instrument cinematic image set covering alto saxophone, tenor saxophone, soprano saxophone, clarinet, flute, oboe and bassoon, with optimized web assets and generated masters retained in the repository;
- restrained cinematic image crops across tuner, pulse, analysis, practice, setup and learning cards so imagery supports the work instead of appearing only in the fingering lab;
- a plain-language copy pass across onboarding, tuner states, learning tools, analysis, practice and handoff surfaces, backed by a regression test for the retired synthetic phrases;
- a first-run four-step onboarding journey led by an expanding-panel instrument gallery, a glow-only fingering lesson and cinematic Tune, Practice and Learn cards; it is replayable from Settings;
- visual, horizontally swipeable setup-part coverflow with a centered featured variant and visible neighbours;
- an oboe anatomy preview that isolates the standard silver-key instrument from the source GLB’s second finish variant and preserves the orbit camera across inspection updates;
- a floating, mobile-derived navigation arc on landscape and larger screens, with the desktop sidebar removed and a saved left/right placement setting;
- an in-product model sourcing register that separates integrated, licensable, blocked and commission-required assets;
- explicit source, licence, readiness and validation boundaries.

It does **not** yet have instrument-grade physical-device validation, a production-signed Play build, a complete take editor, harmonic/staff analysis, professional MIDI/Link workflows, or validated learning systems for the remaining woodwinds.

### Repository and delivery map for this checkpoint

This file is the single written handoff. The verified APK is the only separate binary download; the repository—not a set of parallel source archives—is the source of truth for everything else.

| Deliverable | Repository location | Status |
|---|---|---|
| Hosted web product | `app/`, `public/`, `build/`, `db/` | Implemented and production-deployed |
| Unified detailed sax fingering overlay | `app/ImportedInstrumentCanvas.tsx`, `app/SaxophoneLab.tsx`, `app/sax-data.ts` | Glow-only interaction implemented; educational anchor placement still requires expert/device review |
| Immersive gallery and onboarding | `app/InstrumentExperience.tsx`, `app/globals.css` | Implemented; first run plus replay entry point |
| Visual setup coverflow | `app/SaxophoneLab.tsx`, `app/globals.css` | Implemented for finish, neck, mouthpiece, reed and ligature variants |
| Cinematic image masters | `assets/source/bocal-*-cinematic.png` | Seven generated instrument masters retained |
| Optimized cinematic images | `public/images/bocal-*-cinematic.webp` | Seven instruments used across the gallery and working cards |
| Alto and oboe GLBs | `public/models/` | Implemented with attribution |
| Model sourcing register | `app/page.tsx` and this handoff | Candidate sources recorded; no unlicensed candidate is bundled |
| Native Android app | `android/` | Kotlin/Compose app with tuner, bronze 3D alto lab, onboarding, pulse, analysis, landscape arc and local practice history |
| Versioned debug APKs | `debug-apks/` | App and instrumentation APKs committed here; the website copy is staged during the verified build |
| Automated checks | `tests/`, `android/app/src/test/` and `android/app/src/androidTest/` | Web/repository tests, Android unit tests, lint and compiled device instrumentation |
| Research and detailed validation notes | `docs/` | Supporting repository material; this handoff contains the release-level conclusions |

The previously exposed source/model ZIP downloads were retired from the product surface. They duplicated repository state and could drift from the deployed commit.

### 1.3 interaction research translated into product behavior

The two user-supplied motion references were treated as interaction references, not copied assets:

| Reference observation | Bocal implementation | Reason |
|---|---|---|
| Instrument families appear as full-height, cinematic panels; the focused item expands while neighbours remain visible | First-run and anytime instrument selector uses an expanding horizontal panel deck with a distinct cinematic image for all seven visible instruments | Selection feels like entering an instrument-specific world while unsupported tools remain honest |
| A central item owns attention while adjacent items remain partially visible and spatially receded | Setup variants use scroll-snap coverflow, perspective, featured-card scaling, neighbour peeking and explicit previous/next controls | Swiping remains discoverable without hiding comparison detail or accessibility controls |
| The instrument itself must remain the primary canvas | Model toolbar, view selector and legend moved into a separate dock above the viewport; focus mode removes surrounding panels | Fingertips and keywork are no longer obscured by UI |
| The pressed keys must read instantly | Alto now uses small cyan contact points with a soft radial glow directly on the verified touch targets; no synthetic hands are rendered | Keeps the instrument visible and avoids suggesting anatomical certainty the product has not earned |
| Landscape navigation should remain spatial, not turn into a generic sidebar | The desktop rail disappears; the same floating mobile dock becomes a vertical edge arc and moves left or right from Settings | Preserves the product’s radial character while accommodating handedness and desk setup |

Bocal no longer draws hands, fingers, chin or other body parts. Those overlays looked authoritative without having motion-capture or specialist validation behind them. If body-contact coaching returns, it must be instrument-specific, anatomically reviewed and tested against real playing positions before it reaches a public build.

## 2. Research basis

TonalEnergy’s official positioning spans beginners through world-class musicians, students, educators and professionals, and explicitly covers singers, brass, woodwinds, percussion, strings and guitars. Its official Android guide documents multiple tuner views, target/range controls, temperament and transposition, pitch tracking, metronome sequencing, tone generation, waveform/spectral/harmonic/staff analysis, recording and practice activity. These are the parity benchmarks, not assumptions based on screenshots:

- [TonalEnergy Mobile overview](https://www.tonalenergy.com/te-mobile)
- [TonalEnergy Android/Desktop guide](https://www.tonalenergy.com/tet-user-guide-android)

Android’s current platform guidance supports the native direction in the supplied baseline: AAudio is designed for high-performance low-latency streams, and Google recommends Oboe as a C++ wrapper that selects AAudio when available and falls back when necessary. AAudio itself does not provide device enumeration, routing, file I/O or decoding, so those remain product-layer responsibilities:

- [Android native stable audio APIs](https://developer.android.com/ndk/guides/stable_apis)
- [AAudio guide](https://developer.android.com/ndk/guides/audio/aaudio/aaudio)

For a 2026 Play release, the Android project targets API 36. Google Play requires new apps and updates to target Android 16/API 36 from 31 August 2026. The checked-in native configuration uses JDK 17, AGP 8.13.2, Gradle 8.13 and the stable Compose BOM 2026.06.00:

- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [AGP 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Compose BOM guidance](https://developer.android.com/develop/ui/compose/bom)

## 3. Persona map and five core workflows each

The following seven personas cover the credible v1/v2 market. Accessibility needs—low vision, color-vision deficiency, motor variance, hearing differences and screen-free practice—are cross-cutting requirements, not a separate silo.

### Persona A — new or returning woodwind learner

**Goal:** form correct habits without being overwhelmed by professional controls.

1. **First-note setup:** choose instrument → allow microphone only when starting the tuner → play one sustained note → see written pitch, sounding pitch and a plain-language correction.
2. **Learn a fingering:** choose a written note → view the detailed instrument → see cyan touch targets directly on that saxophone → inspect left/right/back views → hear the sounding pitch.
3. **Build finger memory:** select challenge mode → receive a target note → press virtual touch-pieces → check the route → retry with one useful hint.
4. **Practice with a pulse:** choose tempo and meter → enable a simple subdivision → run a two-minute exercise → end automatically → retain the result locally.
5. **Remember equipment:** log instrument, mouthpiece and reed → record first-use date → rotate reeds → receive an optional local retirement reminder.

### Persona B — advancing student or conservatory/pre-professional player

**Goal:** diagnose recurring weaknesses and rehearse deliberately.

1. **Long-tone diagnostic:** choose note/range lock → play a dynamic long tone → view pitch trace, stability and volume separately → compare the result with the last attempt.
2. **Intonation map:** record a scale → group accepted frames by written note → inspect sharp/flat tendency → add an adjustment note → repeat after warm-up.
3. **Alternate fingering comparison:** select a note with alternatives → compare routes and use cases → hear the pitch target → test each route in context → save a preferred route.
4. **Rehearsal preset:** load a metronome sequence → set count-in and grouped accents → add a drone/temperament → practice a passage → save the exact setup.
5. **Lesson follow-through:** open teacher assignment → start timed session → annotate a passage → attach local evidence → export a compact session bundle.

### Persona C — working professional performer

**Goal:** obtain trustworthy information immediately without UI friction.

1. **Backstage check:** open directly into last tuner configuration → lock desired note/range → verify pitch and reference → dismiss in under ten seconds.
2. **Temperament/context setup:** choose concert/written view → set A reference and temperament/root → load instrument transposition → save as a named preset.
3. **Silent tactile warm-up:** enable capability-aware haptics → feel sharp/flat direction and centered lock → keep the screen dim → disable after warm-up.
4. **Complex click rehearsal:** open set-list preset → run changing meters/tempi → loop selected measures → route audio appropriately → recall at the next rehearsal.
5. **Take review:** record a take → view waveform, pitch and harmonic context → mark a region → compare two takes → export locally.

### Persona D — private teacher or studio instructor

**Goal:** demonstrate clearly, assign work and review progress without accounts.

1. **Demonstrate fingering:** choose student instrument → select note → show player/front/side view → enable visible touch guides → explain linked pads without mislabelling them as finger contacts.
2. **Create an assignment:** select tuner/metronome goals → define duration/tolerance → attach a repertoire note → export assignment bundle → student imports locally.
3. **Review evidence:** import student bundle → inspect accepted frames and attempts → add timestamp/note comments → export annotated bundle → preserve the student’s original evidence.
4. **Compare setup choices:** select mouthpiece/reed/neck category → compare two sourced descriptions → explain trade-offs and compatibility → avoid unsupported product claims.
5. **Run a lesson timer:** start lesson session → switch among tuner, pulse, recorder and lab without losing time → add notes → save locally → export summary.

### Persona E — ensemble director, section coach or band/orchestra educator

**Goal:** coordinate pitch and pulse across multiple players efficiently.

1. **Reference-tone warm-up:** choose concert pitch → set A reference/temperament → play sustained target → increase/decrease register → keep display visible to the room.
2. **Section intonation drill:** define note sequence → give count-in → capture aggregate pitch tendency without identifying students → review common problem notes.
3. **Rhythm rehearsal:** program meter/tempo sequence → configure accents/subdivisions → loop transition → project a simplified visual pulse → save ensemble preset.
4. **Instrument transposition check:** switch among E♭, B♭, F and C instruments → show written/concert mapping → verify student note → return to concert display.
5. **Demonstration mode:** enable visible touches and large type → open instrument anatomy → rotate to needed view → highlight only verified educational data → exit without disturbing the rehearsal preset.

### Persona F — parent or guardian supporting a young learner

**Goal:** help establish a healthy routine without needing musical expertise.

1. **Start today’s plan:** open three-item practice plan → read plain-language task → start timer → keep controls simple → celebrate completion without punitive streak pressure.
2. **Check readiness:** confirm instrument/reed/setup checklist → see nontechnical maintenance prompt → mark completed → avoid changing pedagogical settings.
3. **Enable reminders:** choose days/time → read why notifications are requested → grant optional permission → receive local reminder → pause during holidays.
4. **Share with teacher:** export the selected session → choose any installed sharing app → send no account data → keep the original on device.
5. **Review trend:** view minutes, consistency and completed assignments → avoid ranking or fabricated scores → discuss the next small goal.

### Persona G — woodwind specialist, technician or expert validator

**Goal:** correct the educational representation and protect product credibility.

1. **Model audit:** open exact instrument/version → inspect front, left, right and back → compare control placement → record corrections by semantic part ID.
2. **Mechanism audit:** actuate one touch-piece → verify directly touched input → inspect linked pads and motion → flag normally-open/closed errors → attach evidence source.
3. **Fingering audit:** traverse keyed range → test primary and alternate routes → identify model/system exceptions → approve or reject each versioned route.
4. **Asset readiness audit:** inspect licence → review silhouette and mobile weight → check mesh/node separation → assign preview/learning/rigged status → approve publication boundary.
5. **Release sign-off:** run acceptance checklist on a representative instrument → record reviewer role/date → sign a dataset version → publish corrections as data changes rather than mesh-only hacks.

## 4. End-to-end journey model

| Stage | User question | Bocal response | Failure to avoid |
|---|---|---|---|
| Select | “Does this understand my instrument?” | Instrument, transposition and readiness are explicit | Showing unsupported learning tools as complete |
| Prepare | “Can I start quickly?” | Last-used setup and one primary action | Permission prompts at launch; deep menus |
| Perform | “Can I trust this while playing?” | Stable audio-clock behavior, confidence and redundant visual/haptic encoding | Invented notes, UI-thread timing, hue-only state |
| Understand | “What should I change?” | One specific correction plus optional deeper analysis | A dashboard of unexplained numbers |
| Retain | “Am I improving?” | Device-local evidence, robust summaries and honest uncertainty | Fabricated trends, punitive streaks |
| Share | “Can my teacher help?” | Versioned export/import bundle with consent | Accounts or hidden upload requirements |

## 5. Capability requirements derived from workflows

### Trust foundation (P0)

- Voiced/unvoiced detector with confidence, hysteresis and explicit silence.
- AudioWorklet on web; Oboe/AAudio callback path on Android.
- Synthetic and licensed golden fixtures covering register, noise, attacks, vibrato and octave errors.
- Input level, device/routing, calibration, tolerance, concert/written and transposition controls.
- Audio-clock metronome scheduling; UI animation never acts as timing authority.
- Lifecycle handling for denial, interruption, device change, Bluetooth and backgrounding.

### Daily parity (P1)

- Target, chromatic, bar, cents and pitch-trace tuner views.
- Temperament library, A reference, range/note lock and reference-tone automation.
- Arbitrary meter/grouping, accents, subdivisions, count-in, presets, sequences and loops.
- Full-range tone generator with chords, sequences and safe levels.
- Local practice timer, goals, reminders, equipment/reed rotation and export.

### Analysis and recording (P2)

- Waveform, spectrum, harmonic-energy and note-staff views.
- Take recorder with markers, region selection, loop and A/B comparison.
- Per-note intonation map and robust session summaries.
- Interval/ear trainer and linear-passage repertoire alignment.

### Professional/educator (P3)

- MIDI input/control, external display, keyboard commands and remote control.
- Ableton Link or equivalent shared-tempo workflow.
- Teacher assignment and `.bocalbundle` annotation exchange.
- Large-display and demonstration mode with visible touches.

### Bocal differentiation (P4)

- Educationally validated, semantically versioned instrument anatomy.
- Primary/alternate fingering challenges and linked-mechanism explanations.
- Sourced setup literacy without fabricated acoustic claims.
- Woodwind-specific drills and capability-aware haptic feedback.

## 6. Current delta against TonalEnergy

| Capability | Bocal now | TonalEnergy benchmark | Required action |
|---|---|---|---|
| Basic tuner | Functional confidence-gated web tuner | Multiple mature tuner views and controls | Device/golden validation; more views and settings |
| Metronome | Basic tempo, tap, meter, subdivision, drone | Deep presets, sequencing, looping, assistant, Link | Replace timer authority; add complete sequence model |
| Tone generator | Reference tone and basic drone | Wheel, keyboard, grid and exercise creator | Add full range, chords, sequences, temperament |
| Analysis | Pitch trace, live waveform and spectral-energy preview | Waveform, spectrum, harmonic, staff, interval | Validate current views; add harmonic/staff/interval |
| Recording | Local browser take capture, playback and download | Recording/playback integrated with analysis | Add markers, regions, A/B and structured export |
| Practice data | Local sessions and deterministic evidence | Activity, timed events, goals and streaks | Add robust longitudinal model and honest goals |
| Professional control | Minimal | MIDI, Link, remote/custom layouts | P3 after audio foundation |
| Instrument learning | Alto trainer + oboe anatomy preview | Not incumbent’s central workflow | Validate and expand carefully |
| Native Android | 0.2.0 debug app with tuner, bronze alto lab, onboarding, analysis, curved landscape navigation and local practice history | Shipping native app | Validate on representative devices, expert-check anchors and configure private release signing |

Parity is achieved only when the P0–P3 workflows are reliable and no harder to reach than the incumbent. A long checklist of placeholder screens is not parity.

## 7. Instrument expansion plan

### Readiness tiers

1. **Catalogue:** instrument/transposition exists; no 3D claims.
2. **Anatomy preview:** licensed visual model, correct orientation, mobile budget and explicit credit.
3. **Educational map:** semantic touch-pieces, linked outputs, range and sourced fingerings.
4. **Interactive rig:** independently addressable controls/pads with validated motion.
5. **Expert validated:** named role/date/version approval and regression tests.

### Order

1. Alto saxophone — retain as the validation template; finish expert review and rig acquisition.
2. Soprano, tenor and baritone saxophones — reuse fingering semantics only after documenting family-specific mechanics, range and transposition.
3. B♭ clarinet — obtain a commercial-use model; the supplied CC BY-NC asset is excluded.
4. Flute/piccolo — validate open-hole/closed-hole and mechanism variants explicitly.
5. Oboe/English horn — upgrade the current anatomy preview after specialist fingering/mechanism review.
6. Bassoon/contrabassoon — treat system/version complexity as first-class data.
7. Recorder family — instrument-specific baroque/German fingering systems.

“All woodwinds” must never mean one generic fingering engine with different meshes.

## 8. Asset audit and licensing

| Asset | Licence | Commercial use | Structure | Public status |
|---|---|---:|---|---|
| “saxophone alto” by ANDRIANIAINAToky | CC BY 4.0 | Yes, with attribution | 8 material meshes; not per-key rigged | Detailed alto reference |
| “Saxophone” by Matt Caddie | CC BY 4.0 | Yes, with attribution | Single lightweight mesh | Not selected as primary |
| “Oboe – Howarth Conservatoire S20C” by WarderiiK | CC BY 4.0 | Yes, with attribution | Source contains two finish trees; public viewer isolates the standard `Oboe` root | Anatomy preview |
| “Clarinet model (with annotations)” by Henry Chi | CC BY-NC 4.0 | **No** for commercial Bocal | 3 meshes | Excluded from public build |
| Bocal cinematic alto card photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Tuner card |
| Bocal cinematic oboe photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Oboe card and instrument gallery |
| Bocal cinematic tenor saxophone photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Gallery, pulse and practice cards |
| Bocal cinematic soprano saxophone photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Gallery and planning cards |
| Bocal cinematic clarinet photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Gallery, tuner guidance and lesson cards |
| Bocal cinematic flute photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Gallery, analysis and drone cards |
| Bocal cinematic bassoon photograph | Project-generated asset | Yes for Bocal | PNG master + optimized WebP | Gallery, metronome and history cards |

The generated images are editorial card art, not fingering references or evidence for instrument geometry. Optimized WebP files are kept small for mobile use; full PNG masters stay in `assets/source/`.

### Model sourcing register

No candidate below is presented as an educational fingering model until its licence, silhouette, keywork, node separation, mobile performance and instrument-specific mechanism have been reviewed. “Candidate” means a procurement lead, not a shipped capability.

| Instrument | Candidate/source | Licence or procurement state | Bocal decision |
|---|---|---|---|
| Alto saxophone | [Sketchfab source now integrated](https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27) | CC BY 4.0 | Keep as the visual reference; expert-check all semantic anchors and acquire a per-key rig before claiming animated mechanics |
| Oboe | [Howarth S20C source now integrated](https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8) | CC BY 4.0 | Anatomy preview only; isolate one finish and commission a specialist fingering audit |
| Tenor saxophone | [CGTrader brass tenor candidate](https://www.cgtrader.com/3d-models/sports/music/brass-tenor-saxophone) | Paid, royalty-free listing; purchase and terms review required | Shortlist for visual audit; do not substitute alto anchors or publish before checking keywork and topology |
| Soprano saxophone | Commission brief required | No acceptable commercial-use, education-ready candidate located in this research pass | Commission a straight soprano with separately named key groups and clean mobile topology |
| Clarinet | [User-supplied annotated source](https://sketchfab.com/3d-models/clarinet-model-with-annotations-c47ddcb26eeb4fbd804a45c82f77ba31) | CC BY-NC 4.0 | Do not use commercially without direct written permission or a new commercial licence; source a replacement |
| Flute | [Sketchfab flute candidate](https://sketchfab.com/3d-models/flute-08cb4375f9924366b725c439fd6163a8) | CC Attribution listing; download and attribution review required | Shortlist for silhouette, open/closed-hole variant and separated-key audit before import |
| Bassoon | [CGTrader bassoon candidate](https://www.cgtrader.com/3d-models/furniture/other/fagott-bassoon) | Paid, royalty-free listing; purchase and terms review required | Shortlist for Heckel-system anatomy preview; validate long-joint, boot-joint and key-system detail before import |

The supplied cinematic images remain the correct card assets while procurement is unresolved. They are deliberately not used as evidence that an accurate interactive mesh exists.

## 9. Technical architecture

### Web

- React/Next-compatible Vinext application hosted on Sites.
- Web Audio for input, synthesis and current timing prototypes.
- Three.js for imported GLB viewing and pedagogical mechanism rendering.
- The alto GLB is normalized into a shared scene coordinate system. `SAX_KEYS` supplies semantic touch IDs, finger/side metadata and anchor coordinates; `ImportedInstrumentCanvas` always renders the active cyan contacts and reveals quieter available-touch rings only on request.
- Active touch targets use additive radial sprite halos and emissive contact markers. There is no generated hand geometry. The glow pulses gently but stays attached to the same semantic anchor while the model rotates.
- Imported learning meshes retain their source geometry but use Bocal’s bronze study materials at render time. Keywork is brighter than the body so controls remain legible; source finishes are intentionally not reproduced in the learning viewport.
- Player, left-control, right-control and thumb/back presets filter side-specific targets to avoid implying that left- and right-hand controls occupy the same face.
- Touch targets are interactive and update the shared fingering state. The source GLB itself is not key-rigged, so pad travel remains an explained data trace rather than a fabricated mesh animation.
- The oboe source includes two top-level finish variants. `isolateRootName="Oboe"` publishes only the standard silver-key tree. A stable empty-marker constant and callback refs prevent inspection state from recreating the renderer, while a pointer travel threshold separates orbit gestures from taps.
- Model controls live outside the canvas. Full-screen focus is a real viewport state with an Escape exit and scroll lock, not a CSS enlargement inside the document flow.
- Instrument selection, onboarding and left/right landscape navigation are client-only, localStorage-gated experiences. Unsupported instruments are visible as roadmap context but cannot be selected.
- Setup coverflow retains all sourced caveats, comparison controls and accessible button semantics; perspective and motion are progressive enhancement and respect reduced-motion preferences.
- Device-local storage for practice evidence and notes.
- Static-first deployment; no maintained backend.

### Native Android

- Kotlin, Jetpack Compose, min SDK 26, target/compile SDK 36.
- Native `AudioRecord` tuner with unprocessed-input preference, voice-recognition fallback, confidence gating, audio-focus handling and deterministic written/concert pitch conversion; migrate the real-time callback path to Oboe/AAudio after fixtures stabilize.
- A small OpenGL ES 2 renderer loads the bundled optimized alto GLB directly, applies bronze body/keywork roles and draws semantic key glows from the same note/contact contract used by the learning UI.
- The complete written B♭3–F♯6 keyed range and important alternate routes are bundled in typed Kotlin data; key IDs are regression-tested before the renderer consumes them.
- First-run onboarding uses the seven cinematic instrument images. Unsupported cards are labelled as sourcing/review work rather than behaving like finished trainers.
- Portrait uses the curved bottom dock; landscape rotates that language into a curved edge dock whose left/right placement persists in local settings.
- Practice sessions, notes and active timer start time use device-local preferences. The timer reconstructs elapsed time after process or screen interruptions instead of trusting a UI loop.
- Pitch analysis shows current confidence, cents, frequency, recent in-memory trace and honest device capability flags; it does not claim those flags are measured latency.
- WorkManager/local notifications only after user opts into a reminder.
- No `INTERNET` permission in the local-first release.
- Haptics require capability checks and deterministic fallback.
- The current custom loader is intentionally narrow. Move to a maintained glTF/Filament path before supporting arbitrary third-party meshes or animation rigs.

### Shared contracts

- `InstrumentProfile`: identity, family, transposition, range, readiness and source version.
- `TouchPiece`: semantic ID, hand/contact, side and accessible label.
- `MechanismEdge`: input → output, opens/closes, condition and validation evidence.
- `FingeringRoute`: written pitch, contacts, primary/alternate context and source.
- `SessionEvidence`: accepted frames, notes, cents, confidence and timing.
- `BocalBundle`: versioned session, annotations and optional audio references.

Rendering code must consume these contracts; it must not become the source of musical truth.

## 10. Delta from the supplied Baseline/Claude brief

### Retained

- Native Kotlin/Compose direction.
- Oboe/AAudio as the eventual low-latency Android foundation.
- Backendless/local-first privacy and offline operation.
- Hyle violet/cyan/AMOLED visual language and redundant state encoding.
- Practice, equipment, reminder, longitudinal and coach-exchange concepts.
- Small stable seams for shared Hyle, haptics and baseline contracts.

### Added or corrected

- A browser-deliverable product exists now and is separated from the eventual native audio engine.
- Fingering truth distinguishes direct player contact from linked pad output.
- Alto AF♯ and HF♯ are separate; low E♭ motion and important coupled pads were corrected.
- Imported visual fidelity and interactive pedagogical logic are layered: the licensed mesh remains visually intact while semantic, tappable touch targets render directly over it.
- The source oboe’s duplicate finish trees are no longer rendered together, and orbit gestures no longer cause renderer resets through incidental inspection state.
- First-run instrument selection, guided onboarding, full-screen model focus and visual setup coverflow convert a functional dashboard into a more experiential product without hiding validation status.
- Synthetic hands have been removed from the lab and onboarding. Small key-aligned glows now carry the fingering instruction without obscuring the instrument or implying anatomical accuracy.
- Alto and oboe now share a legible bronze study finish; the collapsed oboe panel uses an instrument-aware crop that keeps the full body visible.
- Tune, Practice and Learn now have distinct cinematic cards with short, task-focused copy instead of generic feature labels.
- Wide and short-landscape layouts remove the desktop sidebar and rotate the mobile glass dock into a floating edge arc. The player can choose left or right placement in Settings, and the preference stays on the device.
- Android now carries the same starting interaction model: a real bundled bronze alto mesh, glow-only key contacts, four-step onboarding, bottom/edge curved navigation and device-local practice sessions. It is no longer a tuner shell with lab/practice placeholders.
- Model procurement is now visible in the product: integrated, licensable, blocked and commission-required states are named instead of being collapsed into “coming soon.”
- Seven instrument images now fill every instrument panel, and the same coherent visual set supplies low-opacity cinematic texture to tuner, pulse, analysis, practice, setup and learning cards.
- Customer-facing copy was rewritten in direct, conversational language. Automated checks prevent the most synthetic phrases from returning.
- Model licences and readiness tiers are release gates.
- Seven personas and 35 concrete workflows translate strategy into acceptance behavior.
- TonalEnergy parity is ordered by measurement/timing integrity before visible feature count.
- Clarinet expansion is blocked by the supplied non-commercial licence.
- “All woodwinds” is a validation program, not a mesh-shopping exercise.

### Deferred from the baseline

- Neural pitch inference before deterministic DSP and golden tests are excellent.
- Urbana/local-LLM coupling in v1 because even localhost networking weakens the no-network-permission trust claim.
- Camera posture analysis before core tuner/metronome/recorder reliability.
- Cross-domain “platform” positioning; Bocal remains a focused consumer product.

## 11. Build, packaging and APK status

This checkpoint includes versioned native debug APKs under `debug-apks/`. `Bocal-native-debug-0.2.0.apk` is the installable app; `Bocal-native-debug-androidTest-0.2.0.apk` is its instrumentation companion. The verified website build stages the selected app APK to `public/downloads/Bocal-native-debug.apk` without keeping a second committed binary. The app was built from the checked-in Kotlin/Compose project with JDK 17, Android platform 36, Build Tools 36.0.0, AGP 8.13.2 and Gradle 8.13.

Validation completed here:

- `:app:testDebugUnitTest` passed;
- `:app:lintDebug` passed;
- `:app:assembleDebug` passed;
- `:app:assembleDebugAndroidTest` passed, proving the physical-device instrumentation compiles and packages;
- `apksigner verify --verbose --print-certs` passed with APK Signature Scheme v2;
- `aapt2 dump badging` confirmed package `com.bocal.music`, version `0.2.0`, min SDK 26 and target SDK 36;
- the packaged manifest contains `RECORD_AUDIO` and no `INTERNET` permission;
- the APK contains the 1.7 MB alto GLB and all seven optimized cinematic instrument images;
- ZIP integrity validation passed;
- app SHA-256: `eba6d45814e782701faffae842a70f20dfd6dbf94de4ff9e79eec9ca5b543c22`;
- instrumentation SHA-256: `fb89d1fec627539655c01c7a86fd849eb91d76a2ee3434adbc4323f74ddb28c3`.

This is debug-signed. It is suitable for direct engineering evaluation, not Play Store distribution. No physical Android device was attached to the build workspace. Installation, real microphone accuracy, measured latency, competing-audio interruptions and GPU/rotation behavior therefore remain unverified on hardware; they are explicitly marked `Not run` in `android/PHYSICAL_DEVICE_TEST_PLAN.md`. The repository includes a connected-device runner and instrumentation for asset presence, onboarding, lab entry, lifecycle and rotation, but compiled tests are not device results.

Required release build environment:

1. JDK 17.
2. Android Studio or command-line SDK with platform 36 and build tools.
3. The checked-in Gradle 8.13 wrapper and AGP 8.13.2.
4. A physical Android phone for microphone/routing/latency checks.
5. A private signing keystore that is never committed or shared in chat.

Build sequence after SDK installation:

```text
cd android
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebugAndroidTest
```

Release signing and Play upload must be completed in the owner’s trusted build environment. Never commit the release keystore.

## 12. QA and release gates

The checkpoint’s repository suite passes the web/product checks plus the native Android unit, lint, app-packaging and instrumentation-packaging tasks. Those checks protect scope and regressions; they do not replace the acoustic, device and expert validation below.

- Synthetic pitch tests from 55–2200 Hz, including octave-confusion cases.
- Licensed, hand-labelled alto golden recordings and per-device accuracy reports.
- 30-minute metronome drift/jitter test using recorded click onsets.
- Permission denial/revocation, interruption, route change and Bluetooth warnings.
- Low-, mid- and high-tier Android devices; wired and built-in microphones.
- WebGL/mobile GPU memory and frame-rate budgets for every model.
- Regression coverage for single-root asset isolation, stable renderer setup, tap-versus-orbit thresholds, glow-only contact rendering and active-contact visibility.
- Asset coverage checks for all seven cinematic PNG/WebP pairs plus a copy regression check for retired synthetic wording.
- First-run, replay, keyboard, reduced-motion and narrow-viewport checks for onboarding and both coverflows; left/right navigation persistence is covered in the product suite.
- Non-hue semantic encoder for every state.
- Expert sign-off for any instrument advertised as a learning trainer.
- Licence/attribution check included in automated release tests.

## 13. Open decisions and blockers

1. Acquire a commercially usable, separately rigged modern alto model or fund controlled rigging of the selected reference.
2. Purchase and audit the shortlisted tenor, flute and bassoon candidates; obtain a commercial clarinet licence or replacement; commission soprano and baritone meshes.
3. Recruit an alto saxophonist plus technician/experienced teacher for v1 dataset sign-off.
4. Select and license golden audio fixtures.
5. Install the debug APK on representative phones and complete microphone, routing, suspend/resume, power and latency validation; then configure private release signing.
6. Decide whether the first Play release ships the current native 3D lab or holds it until anchor placement receives named expert sign-off.
7. Do not reintroduce body-part overlays until instrument-specific posture reviewers, anatomical references and real-player usability tests support them.

## 14. Definition of done

Bocal v1 is done only when:

1. P0 tuner and timing release gates pass on representative Android devices.
2. The native APK builds, installs, resumes and handles microphone denial safely. Build and packaged instrumentation are proven in this checkpoint; installation and lifecycle behavior still require physical-device evidence.
3. Alto learning data receives recorded expert sign-off.
4. Fingering targets remain visibly attached to the detailed model in player, left-control, right-control and thumb/back views; active contacts stay visible with optional targets hidden.
5. Practice evidence remains local, exportable and deterministic.
6. Accessibility and no-network-permission claims are verified.
7. The repository source, models, seven cinematic masters, glow-only onboarding, coverflow, copy audit, model-source register, navigation settings, licences and this single handoff match the deployed version.

The current build is a strong checkpoint, not that definition of done.
