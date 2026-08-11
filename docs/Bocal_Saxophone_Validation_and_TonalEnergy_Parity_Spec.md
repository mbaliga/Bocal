# Bocal Saxophone Validation and TonalEnergy Parity Specification

**Version:** 1.0  
**Date:** 10 August 2026  
**Product:** Bocal  
**Instrument baseline:** Modern keyed E♭ alto saxophone, written B♭3–F♯6  
**Implementation status:** Corrected web implementation complete; production release candidate  
**Validation status:** Manufacturer-chart and mechanism-source pass complete. A final hands-on sign-off by a saxophone teacher or repair technician on a representative modern alto remains a release gate; this document does not claim human certification or service-manual CAD fidelity.

---

## 1. Executive decision

Bocal should not try to win by copying TonalEnergy screen for screen. It must first match TonalEnergy where measurement reliability, timing, tone generation, analysis and professional controls matter, then win through a simpler practice flow and instrument-specific learning that TonalEnergy does not provide.

This pass makes four concrete product corrections:

1. The alto model now distinguishes **where a finger acts** from **which remote pad moves**.
2. The keyed range and Yamaha-chart alternates are represented as player touch-pieces, including the linked B-pad behavior of front E/F.
3. The visual default is a black body with gold keywork; five additional colourways are selectable without inventing tone claims for lacquer colour.
4. The saxophone is now an explorable setup: finish, neck, mouthpiece, reed and ligature variants can be understood and compared, with source labels and explicitly illustrative audio.

The corrected model contains **23 distinct player touch-pieces**. The earlier implementation incorrectly merged the alternate/fork F♯ control with the keyed high-F♯ control. They are now separate.

## 2. Validation scope and boundary

### 2.1 What is validated

- Player-facing touch-pieces on a modern alto with front F and keyed high F♯.
- Immediate open/close consequence of every represented touch-piece.
- Important multi-pad linkages: automatic octave vents, front-F-to-B, low-B-to-low-C and low-B♭-to-low-B/low-C.
- Primary fingerings for every chromatic written pitch from B♭3 through F♯6.
- Alternate routes shown by Yamaha for regular F♯, B♭, C, high E, high F and high F♯.
- Alto transposition: written pitch sounds a major sixth lower.

### 2.2 What is deliberately not claimed

- Service-CAD dimensions, spring forces, screw locations, pad-seat tolerances or model-specific rod geometry.
- Every historical key system or vintage horn.
- Altissimo fingerings above keyed F♯6. These vary substantially by instrument, mouthpiece, voicing and player.
- Every specialist trill, microtonal, multiphonic or intonation-correction fingering. The current alternate set is the finite manufacturer-chart baseline.
- The full interaction matrix of articulated G♯ and every regulation linkage under simultaneous unusual key combinations.

Yamaha describes a saxophone as four main sections with 25 tone holes; a professional instrument has hundreds of components. Bocal therefore models the **pedagogically important control graph**, not every manufactured part. See [Yamaha’s saxophone structure guide](https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/) and [Yamaha’s interactive fingering chart](https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play002.html).

## 3. Visual teaching grammar

The encoding must remain literal in every instrument model:

| Visual state | Meaning | Must never mean |
|---|---|---|
| Solid cyan touch-piece | Put a fingertip, thumb or palm here | A remote pad happens to move |
| Thin cyan ring around a cup | This linked pad moves | Put a finger on this cup |
| Translucent cyan fingertip | Optional placement guide at the actual player contact | A second required key |
| Gold metal | Resting keywork and linkage | Inactive or incorrect state by colour alone |
| Black body | Default Bocal teaching colourway | A tone-quality rating |

Additional rules:

- Fingertip guides are optional and default to off.
- Guides may appear only after the underlying touch map is correct.
- A user may tap only a touch-piece; pad cups and rods are not hit targets.
- Every highlighted state also has a text label and hand/finger description.
- Linked outputs must state **opens** or **closes**. “Pressed” is not an adequate description of pad behavior.
- Camera rotation is manual. Reset returns to a repeatable teaching view.

## 4. Complete touch-piece and linked-pad ledger

The table below is the source of truth for the current educational alto.

| # | Player touch-piece | Hand/contact | Linked pad output | Motion when actuated |
|---:|---|---|---|---|
| 1 | Octave lever | Left thumb | Neck octave vent for A and above; body octave vent for G♯ and below | The automatic rocker opens one selected vent, not both |
| 2 | Front F touch | Left index reach | Front-F vent; B tone-hole pad | Opens front-F vent; closes B pad through linkage |
| 3 | B pearl | Left index | B tone-hole pad | Closes |
| 4 | Bis B♭ pearl | Left index edge | Bis B♭ pad | Closes |
| 5 | A pearl | Left middle | A tone-hole pad | Closes |
| 6 | G pearl | Left ring | G tone-hole pad; participates in octave changeover | Closes G pad |
| 7 | High-D palm touch | Left palm/index base | High-D vent pad | Opens |
| 8 | High-E♭ palm touch | Left palm/index base | High-E♭ vent pad | Opens |
| 9 | High-F palm touch | Left palm/ring-side reach | High-F vent pad | Opens |
| 10 | G♯ touch | Left little finger | Normally closed G♯ pad | Opens |
| 11 | Low-C♯ touch | Left little finger | Normally closed low-C♯ pad | Opens |
| 12 | Low-B touch | Left little finger | Low-C pad; low-B bell pad | Closes both |
| 13 | Low-B♭ touch | Left little finger | Low-C pad; low-B bell pad; low-B♭ bell pad | Closes all three |
| 14 | F pearl | Right index | F tone-hole pad | Closes |
| 15 | E pearl | Right middle | E tone-hole pad | Closes |
| 16 | D pearl | Right ring | D tone-hole pad | Closes |
| 17 | High-E side touch | Right index side | High-E vent pad | Opens |
| 18 | Side-C touch | Right index side | Side-C vent pad | Opens |
| 19 | Side-B♭ touch | Right index side | Side-B♭ vent pad | Opens |
| 20 | Keyed high-F♯ touch | Right-hand side reach | Dedicated high-F♯ vent pad | Opens |
| 21 | Alternate/fork F♯ touch | Right-hand lower side reach | Alternate F♯ vent pad | Opens; used together with the F pearl |
| 22 | Low-C touch | Right little finger | Low-C pad | Closes |
| 23 | Low-E♭ touch | Right little finger | Normally closed low-E♭ pad | **Opens** |

### 4.1 Corrections made during this pass

- Split the previously conflated alternate F♯ and high-F♯ controls.
- Added the required right-index F-pearl contact to alternate F♯.
- Added the high-E side touch to the palm routes for high F and high F♯.
- Corrected low E♭ from “closes” to “opens.”
- Added coupled low-pad movement for low B and low B♭.
- Added the front-F-linked B-pad closure without falsely marking the B pearl as a finger contact.
- Kept octave vent selection conditional instead of implying both vents open.

## 5. Complete keyed-range fingering ledger

### 5.1 Notation

- `T` — octave lever
- `L1 L2 L3` — left B, A and G pearls
- `R1 R2 R3` — right F, E and D pearls
- `Bis` — bis B♭ pearl
- `G♯`, `LC♯`, `LB`, `LB♭` — left little-finger cluster
- `LC`, `LE♭` — right little-finger low C and low E♭
- `PD PE♭ PF` — high-D, high-E♭ and high-F palm touches
- `SE`, `SC`, `SB♭` — high-E, side-C and side-B♭ touches
- `FF` — front F
- `AF♯` — alternate/fork F♯ touch
- `HF♯` — keyed high-F♯ touch
- `—` — no player touch-piece pressed

This ledger records player contacts. Linked pads are derived from Section 4 and are not repeated as extra fingertips.

| Written pitch | Primary player contacts | Manufacturer-chart alternate | Use note |
|---|---|---|---|
| B♭3 | L1 L2 L3 · R1 R2 R3 · LB♭ | — | Low-B♭ touch carries low C and low B closed |
| B3 | L1 L2 L3 · R1 R2 R3 · LB | — | Low-B touch also closes low C |
| C4 | L1 L2 L3 · R1 R2 R3 · LC | — |  |
| C♯4 | L1 L2 L3 · R1 R2 R3 · LC♯ | — | LC♯ opens its normally closed vent |
| D4 | L1 L2 L3 · R1 R2 R3 | — |  |
| E♭4 | L1 L2 L3 · R1 R2 R3 · LE♭ | — | LE♭ opens its normally closed vent |
| E4 | L1 L2 L3 · R1 R2 | — |  |
| F4 | L1 L2 L3 · R1 | — |  |
| F♯4 | L1 L2 L3 · R2 | L1 L2 L3 · R1 · AF♯ | Alternate/fork route is useful around F–F♯ |
| G4 | L1 L2 L3 | — |  |
| A♭4 | L1 L2 L3 · G♯ | — |  |
| A4 | L1 L2 | — |  |
| B♭4 | L1 · Bis | L1 · SB♭ | Bis is the default scale route; side B♭ is useful beside B natural and in trills |
| B4 | L1 | — |  |
| C5 | L2 | L1 · SC | Side C is useful beside B and in trills |
| C♯5 | — | — | Open fingering |
| D5 | T · L1 L2 L3 · R1 R2 R3 | — |  |
| E♭5 | T · L1 L2 L3 · R1 R2 R3 · LE♭ | — |  |
| E5 | T · L1 L2 L3 · R1 R2 | — |  |
| F5 | T · L1 L2 L3 · R1 | — |  |
| F♯5 | T · L1 L2 L3 · R2 | T · L1 L2 L3 · R1 · AF♯ |  |
| G5 | T · L1 L2 L3 | — |  |
| A♭5 | T · L1 L2 L3 · G♯ | — |  |
| A5 | T · L1 L2 | — |  |
| B♭5 | T · L1 · Bis | T · L1 · SB♭ |  |
| B5 | T · L1 | — |  |
| C6 | T · L2 | T · L1 · SC |  |
| C♯6 | T | — |  |
| D6 | T · PD | — |  |
| E♭6 | T · PD · PE♭ | — |  |
| E6 | T · PD · PE♭ · SE | T · FF · L2 · L3 | Front-F linkage supplies the B-pad state; L1 is not a fingertip target |
| F6 | T · PD · PE♭ · PF · SE | T · FF · L2 | Front route supplies linked B-pad state |
| F♯6 | T · FF · L2 · HF♯ | T · PD · PE♭ · PF · SE · HF♯ | HF♯ is not the lower AF♯ control |

Enharmonic spellings use the same keyed route. Bocal currently shows the common flat spellings A♭, B♭ and E♭ in the chromatic browser.

## 6. Sax Lab release acceptance criteria

The Sax Lab is releasable only when all of the following pass:

1. There are 23 independently tappable controls in the modern-alto configuration.
2. `AF♯` and `HF♯` are distinct controls, positions and labels.
3. No pad cup or rod can be tapped as though it were a finger contact.
4. Solid cyan appears only on directly touched controls.
5. Every directly or mechanically moved modeled cup receives an outline and moves in the correct open/close direction.
6. Front F outlines both its vent and the B pad, while the B pearl remains gold unless L1 is actually contacted.
7. Low B closes its own cup and the low-C cup; low B♭ also closes low B and low C.
8. Low E♭ visibly opens rather than closes.
9. Switching primary/alternate routes updates the touch list, model, linked-pad trace and challenge answer atomically.
10. Challenge mode accepts every declared manufacturer-chart route and rejects partial combinations.
11. The default colourway is black body/gold keywork at first launch and after reset.
12. Colourway changes do not alter fingering, mechanics or claimed sound.
13. Translucent guides sit above direct contacts and cannot intercept taps.
14. Written-to-concert conversion for alto is nine semitones downward.
15. The complete B♭3–F♯6 range has deterministic unit-test coverage.

### Required external sign-off

Before calling the model “specialist certified,” record a short screen review with one working alto saxophonist and one repair technician or experienced teacher. Ask each reviewer to verify:

- control identity and relative placement;
- normally open/closed pad direction;
- front-F and low-stack linkage explanation;
- all six alternate routes;
- whether the default camera views make left-thumb, left-palm and right-side controls unambiguous.

Any disagreement must become a versioned data correction, not a mesh-only workaround.

## 7. Colourway and setup explorer specification

### 7.1 Colourways

The implemented choices are:

- Noir & gold — default black body, gold keywork.
- Classic gold — gold body and keywork.
- Gold & silver — gold body, silver-coloured keywork.
- Rose & gold — rose body, gold keywork.
- Prism & gold — iridescent violet/teal body, gold keywork.
- Black & silver — black body, silver-coloured keywork.

Colourways are appearance and legibility choices. They are not tone scores. Yamaha states that saxophone metal parts are commonly brass and may receive plating or lacquer; Bocal must avoid presenting colour as a controlled acoustic result. See [Yamaha’s manufacturing overview](https://www.yamaha.com/en/musical_instrument_guide/saxophone/manufacturing/).

### 7.2 Selectable setup parts

| Part | What the learner should understand | Current variants | Evidence rule |
|---|---|---|---|
| Finish | Appearance, contrast, care and surface treatment | Six Bocal colourways | No tone chart or audio |
| Neck | Bore/taper trade-offs: resistance, focus, flexibility and response | Yamaha-style C1, E1, V1 | Manufacturer language, clearly labelled |
| Mouthpiece | Tip opening, facing, response, volume and reed compatibility | Yamaha 4C, 5C, 6C | Show dimensions and manufacturer descriptions |
| Reed | Cut/strength effects on response, resistance, overtone emphasis and projection | Légère Signature, American Cut, French Cut | Normalized qualitative chart, not measurements |
| Ligature | Reed security, pressure distribution, handling and repeatability | Two-screw metal, fabric wrap, pressure plate | Educational archetypes; tonal claims secondary |

Yamaha emphasizes that reed, mouthpiece and ligature work as a system and that mouthpiece opening/facing must be matched to reed strength. See [Yamaha’s reed and mouthpiece selection guide](https://www.yamaha.com/en/musical_instrument_guide/saxophone/selection/selection002.html). The neck profiles derive from [Yamaha’s C1/E1/V1 descriptions](https://usa.yamaha.com/products/musical_instruments/winds/saxophones/alto_saxophone_neck/index.html); mouthpiece dimensions derive from [Yamaha’s alto mouthpiece specifications](https://usa.yamaha.com/products/musical_instruments/winds/mouthpieces/saxophones/custom_standard.html).

### 7.3 Attribute and comparison behavior

- A part tab changes the explanatory copy and available variants.
- The user may select at most two variants for A/B comparison.
- Every bar has named low/high anchors and a source/evidence badge.
- Bars normalize qualitative claims to a common visual scale. They are not laboratory measurements and must never display fabricated precision.
- Compatibility warnings remain visible: instrument fit, mouthpiece facing, reed strength, embouchure and player experience all matter.
- Future product entries require a source URL, captured date, instrument family, compatibility fields and evidence class.

### 7.4 Audio snippets

The current snippets are equal-loudness Web Audio syntheses that exaggerate brightness, response, projection and resistance enough to teach the words. They are **not recordings of the named products**.

Production product comparisons should be added only with a controlled protocol:

1. Same saxophone, player, room, microphone position, note, dynamic and musical phrase.
2. Loudness-normalized playback with the unnormalized level also retained as metadata.
3. Randomized blind A/B option.
4. Product, strength, mouthpiece, tip opening and recording-chain metadata.
5. At least three takes and no claim that a single recording predicts the user’s result.
6. Rights clearance for every recording.

Reed personality summaries currently use official descriptions from [Légère Signature](https://legere.com/products/eb-alto-saxophone-signature-series), [Légère American Cut](https://legere.com/products/alto-saxophone-american-cut) and [Légère French Cut](https://legere.com/pages/french-cut-saxophone-clarinet-reed).

## 8. Current Bocal capability baseline

The web application is a polished functional prototype, not yet TonalEnergy parity.

| Area | Current Bocal state | Parity consequence |
|---|---|---|
| Tuner | Live microphone, simple autocorrelation, cents/note display | Useful demo; not yet instrument-grade across noise, registers and devices |
| Metronome | Tempo, tap, a few meters/subdivisions, browser haptics and simple drone | Missing audio-clock rigor and most professional controls |
| Practice | Local timer, note log, basic export and local state | Longitudinal analytics and several dashboard values remain incomplete/static |
| Tone generation | Basic tone and four-note drone behavior | Missing full range, temperaments, chord/sequence workflow and presets |
| Recording | No complete take recorder/editor | Major TonalEnergy gap |
| Analysis | No waveform, spectrum, harmonic or staff analysis suite | Major TonalEnergy gap |
| Interoperability | Browser-local operation | Missing MIDI, Ableton Link, remote control and robust file workflows |
| Instrument learning | Corrected interactive alto mechanics, setup explorer and challenge | Bocal differentiation; TonalEnergy does not center this workflow |
| Native Android | This repository is the hosted web implementation | Native APK requires the separate Android audio/product shell described below |

TonalEnergy’s current official overview and Android guide describe multiple tuner views, practice statistics, metronome sequencing and automation, tone generation, analysis, recording and professional connectivity. See [TonalEnergy Mobile](https://www.tonalenergy.com/te-mobile) and the [TonalEnergy Android/Desktop guide](https://www.tonalenergy.com/tet-user-guide-android).

## 9. Prioritized TonalEnergy parity plan

Priority is based on user harm if wrong, dependency order and frequency of use—not screenshot visibility.

### P0 — Measurement and timing integrity

**Outcome:** Bocal becomes trustworthy enough for a learner and fast enough for a professional warm-up.

1. Replace main-thread autocorrelation with a voiced/unvoiced pitch engine using a clean-room YIN/MPM-class algorithm and explicit confidence.
2. Move web analysis into an `AudioWorklet`; never couple pitch cadence to UI frames.
3. Use native audio-clock scheduling for metronome clicks; remove `setInterval` as the timing authority.
4. Add input-device selection, level/noise checks, A4 calibration, instrument transposition and configurable in-tune tolerance.
5. Add deterministic DSP fixtures: sine, saw, harmonically rich tone, vibrato, attacks, noise and octave-confusion cases.
6. Build a licensed golden set of alto long tones, scales, subtone and upper-register samples with hand-verified f0 tracks.
7. Add lifecycle safety: permission denial, device change, phone call/interruption, background/foreground and Bluetooth warnings.

**Release gates**

- Synthetic clean sines from 55–2200 Hz: median error ≤1 cent and no systematic octave choice error.
- Golden sustained-sax frames: median absolute error ≤3 cents; at least 95% of high-confidence voiced frames within 5 cents.
- Octave errors below 0.5% of high-confidence voiced frames in the golden set.
- Audio scheduler drift below one audio frame over a 30-minute metronome run; audible click onset jitter measured, not inferred from UI animation.
- No allocations, file I/O or locks in the native real-time callback.

### P1 — Daily tuner, metronome and tone-generator parity

**Tuner**

- Target, chromatic, bar, cent and activity/pitch-trace views.
- Concert/written pitch switch and complete transposition presets.
- A4 reference, in-tune range, reference-tone auto-play and note/range lock.
- Equal temperament plus a curated temperament library with clear root/context controls.
- Tone quality and volume meters separated from intonation.
- Per-note recent tendency and stable-note capture.

**Metronome**

- Arbitrary meter, beat grouping, subdivisions, accents and independent volumes.
- Count-in, visual flash, speech/count sounds and capability-aware haptics.
- Saved presets, set lists and one-tap rehearsal recall.
- Tempo ramps, relative/percentage tempo, loops and multi-stage sequences.
- Random beat or measure silencing, polyrhythm and independence exercises.

**Tone generator**

- Wheel, keyboard and pitch-grid input.
- Single notes, intervals, chords and drones across the supported range.
- Temperament-aware generation, transposition and tuning reference.
- Presets and sequenced exercises with safe output-level defaults.

### P2 — Analysis, recording and deliberate practice

**Outcome:** The app explains what happened, not merely where the needle landed.

- Record and play back takes with markers, loop regions and nondestructive trim.
- Pitch and tempo shift for playback where device performance permits.
- Waveform, pitch trace, note staff, spectrum, harmonic ladder and volume envelope.
- Attack, steady-state and release segmentation for long-tone coaching.
- Per-note intonation map, stability, response latency and usable-range trends.
- Interval recognition/training and automatically generated tone/rhythm exercises.
- Local goals, timed events, session history, grace-aware streaks and honest weekly summaries.
- Export audio plus CSV/JSON/PDF practice reports without requiring an account.

### P3 — Professional and educator parity

- Fully customizable saved workspaces/views.
- External display and remote-command workflow.
- MIDI input/output mapping.
- Ableton Link or equivalent synchronized-tempo integration where licensing/platform support permits.
- Preset/set-list import/export and durable schema versioning.
- Teacher annotations anchored to time, note and exercise in a `.bocalbundle` file.
- Accessibility verification: screen reader, switch input, reduced motion, large targets, no hue-only state and landscape/tablet layouts.

### P4 — Bocal’s defensible lead beyond TonalEnergy

These should advance after P0 reliability, not replace it:

1. Validated interactive models for soprano, tenor and baritone saxophones, then flute, clarinet, oboe, bassoon and recorder families.
2. Guided hand transfer: camera angle presets, translucent fingers, slow motion and “why this pad moved” explanations.
3. Setup literacy: compatible neck/mouthpiece/reed/ligature comparison, controlled recordings and equipment-life log.
4. Repair literacy: leak symptoms, pad-state demonstrations and safe maintenance boundaries without encouraging unsafe adjustment.
5. Repertoire-aware practice: score following, loop extraction and note-specific tuning tendencies.
6. On-device posture/hand-position coaching with explicit privacy and confidence limits.

## 10. Ordered backlog matrix

| Rank | Capability | Priority | Impact | Effort | Dependency | Competitive role |
|---:|---|---|---|---|---|---|
| 1 | Verified pitch engine and golden tests | P0 | Critical | L | None | Trust foundation |
| 2 | Audio-clock metronome engine | P0 | Critical | M | Audio architecture | Trust foundation |
| 3 | Full tuner controls and trace views | P1 | Very high | L | Rank 1 | TonalEnergy parity |
| 4 | Meter/subdivision/accent/preset/sequence metronome | P1 | Very high | L | Rank 2 | TonalEnergy parity |
| 5 | Temperament-aware tone/chord/drone generator | P1 | High | M | Shared pitch model | TonalEnergy parity |
| 6 | Take recording and playback | P2 | High | L | Audio lifecycle | TonalEnergy parity |
| 7 | Waveform/pitch/spectrum/harmonic analysis | P2 | High | L | Ranks 1 and 6 | TonalEnergy parity plus coaching |
| 8 | Local session/per-note longitudinal analytics | P2 | High | M | Stable event schema | Existing Baseline strategy |
| 9 | Exercise generator, interval and silence/ramp drills | P2 | Medium-high | M | Ranks 4 and 5 | TonalEnergy parity |
| 10 | Custom views, MIDI, sync and remote controls | P3 | Medium for learners; high for pros | XL | Stable core | Professional parity |
| 11 | Expand validated instrument models | P4 | Very high differentiation | XL | Alto validation pipeline | Bocal moat |
| 12 | Controlled setup recordings and equipment intelligence | P4 | High differentiation | L | Rights/content pipeline | Bocal moat |

## 11. Architecture handoff

### 11.1 Shared product contracts

Create versioned, platform-neutral data packages for:

- instrument anatomy and semantic part IDs;
- touch-piece → pad-output graph;
- primary/alternate fingering routes and use notes;
- transposition/range metadata;
- setup parts, variants, compatibility and evidence;
- practice events, pitch estimates and exported sessions.

Never bury fingering truth solely in Three.js or Compose view code. The model, list, challenge, tests and future Android app must consume the same data contract.

### 11.2 Web implementation

- Keep the hosted app local-first and static-first.
- Use Web Audio `AudioWorklet` for capture/analysis and the audio clock for scheduling.
- Store preferences, presets and sessions in IndexedDB with explicit schema versions.
- Keep Three.js for interaction. Migrate the procedural sax to a semantically named GLB when a sufficiently accurate educational asset is produced: `body_*`, `touch_*`, `pad_*`, `rod_*`, `guide_anchor_*`.
- Retain a lightweight procedural fallback for devices that cannot load the full asset.

### 11.3 Native Android implementation

- Kotlin + Jetpack Compose for navigation, state and accessible UI.
- Oboe/AAudio for low-latency capture and playback; request exclusive/low-latency mode but handle denial.
- Dedicated real-time ring buffer and analysis worker. No UI, allocation, locks or storage in the audio callback.
- Room/SQLite for local structured data and app-private files for opt-in audio.
- Renderer options: Filament or SceneView for semantic GLB interaction; use the same part and fingering IDs as web.
- Capability-aware Android haptics with deterministic fallback patterns.
- No account or backend is required for the parity core. File exchange and local notifications preserve the existing privacy strategy.

Start with separate transparent web and Android DSP implementations sharing test fixtures. Promote a portable native DSP kernel only after the algorithm and API stabilize; premature cross-platform abstraction would slow the accuracy work.

### 11.4 Data example

```json
{
  "instrument": "alto-sax-modern-high-fsharp",
  "writtenPitch": "F#6",
  "route": "front-primary",
  "contacts": ["octave", "frontF", "lh2", "highFsharp"],
  "padOutputs": [
    { "pad": "selected-octave-vent", "motion": "open" },
    { "pad": "front-f-vent", "motion": "open" },
    { "pad": "b-tone-hole", "motion": "close", "linked": true },
    { "pad": "a-tone-hole", "motion": "close" },
    { "pad": "high-fsharp-vent", "motion": "open" }
  ],
  "source": "yamaha-fingering-chart",
  "schemaVersion": 1
}
```

## 12. Test and release strategy

### 12.1 Data tests

- Every `SaxKeyId` has one touch definition, one mechanism definition and one model node.
- Every fingering contact resolves to a known touch-piece.
- Primary/alternate route IDs are unique.
- No route contains both `altFsharp` and `highFsharp`.
- Alternate F♯ includes `R1 + AF♯`; keyed F♯6 includes `HF♯`.
- Palm F/F♯ routes include `SE`; front F routes do not.
- Open C♯5 contains zero direct contacts.
- Alto concert conversion is invariant over the complete range.

### 12.2 Interaction tests

- Raycast each touch node and verify the corresponding ID.
- Raycast each cup/rod and verify no input event.
- For each note/route, snapshot direct-touch colours and linked-cup outline states separately.
- Toggle guides and ensure active-contact count does not change.
- Cycle colourways and verify semantic materials remain assigned to body vs keywork.
- Run challenge acceptance against every declared route and near-miss.

### 12.3 Visual and device QA

- Portrait phone at 360, 393 and 430 CSS px widths.
- Landscape phone and tablet split view.
- Mid-range Android GPU and reduced-motion mode.
- High-contrast review on black/gold and gold/silver colourways.
- Manual front, left-palm, right-side and thumb views on a real alto held beside the screen.
- Microphone/timing QA on wired, built-in and Bluetooth routes, with Bluetooth latency limitations disclosed.

## 13. Delta from the supplied Baseline/Claude build brief

### What the baseline got right

- Native Android, Kotlin/Compose and Oboe/AAudio are appropriate for the eventual low-latency APK.
- Local-first operation, no account requirement and no-network MVP are meaningful privacy advantages.
- Clean-room pitch detection and avoidance of GPL contamination are sensible.
- Golden sax recordings, synthetic DSP tests, colourblind-safe redundant encoding and local export are correct foundations.
- Equipment logging and longitudinal practice intelligence remain valuable.

### What this specification adds or changes

| Baseline area | Delta in this deliverable |
|---|---|
| Instrument learning | Adds a complete 23-touch-piece alto control inventory and linked-pad graph |
| Fingering | Adds full B♭3–F♯6 primary ledger plus finite Yamaha-chart alternates |
| Mechanical truth | Separates finger input from pad output; corrects normally open/closed behavior and low-stack/front-F coupling |
| 3D UX | Defines a strict cyan-fill/cyan-outline/translucent-guide grammar and release gates |
| Setup/equipment | Turns equipment logging into a selectable, evidence-labelled setup comparison experience |
| Audio examples | Defines illustrative synthesis now and a controlled recording protocol later |
| TonalEnergy parity | Adds a current feature inventory, dependency-ordered backlog and measurable release criteria |
| Current-state honesty | Identifies the hosted app as a polished prototype rather than implying parity from visual fidelity |
| Backend scope | Keeps the parity core backendless; defers collaboration infrastructure until there is demonstrated need |
| Architecture | Requires shared semantic anatomy/fingering data across web, GLB and Android rather than duplicating truth in render code |

### What should be deferred

- Social feeds, accounts and cloud sync before retention proves the need.
- Marketplace or purchasing recommendations before compatibility data and commercial-disclosure rules exist.
- Claims that lacquer colour has a deterministic tone personality.
- A large neural pitch model before the deterministic DSP baseline and golden tests are excellent.
- Expansion to every woodwind before the alto validation pipeline receives human sign-off.

## 14. Research sources

Primary and manufacturer sources used in this pass:

- [Yamaha — Saxophone fingering](https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play002.html)
- [Yamaha — Saxophone structure and tone holes](https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/)
- [Yamaha — Reed structure](https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/mechanism002.html)
- [Yamaha — Choosing a reed and mouthpiece](https://www.yamaha.com/en/musical_instrument_guide/saxophone/selection/selection002.html)
- [Yamaha — Alto C1/E1/V1 necks](https://usa.yamaha.com/products/musical_instruments/winds/saxophones/alto_saxophone_neck/index.html)
- [Yamaha — Custom standard saxophone mouthpieces](https://usa.yamaha.com/products/musical_instruments/winds/mouthpieces/saxophones/custom_standard.html)
- [Yamaha — Modern alto specification with front F and high F♯](https://th.yamaha.com/en/musical-instruments/brass-woodwinds/products/saxophones/yas-875ex-02/specs.html)
- [Légère — Alto Signature](https://legere.com/products/eb-alto-saxophone-signature-series)
- [Légère — Alto American Cut](https://legere.com/products/alto-saxophone-american-cut)
- [Légère — French Cut](https://legere.com/pages/french-cut-saxophone-clarinet-reed)
- [TonalEnergy — Mobile feature overview](https://www.tonalenergy.com/te-mobile)
- [TonalEnergy — Android/Desktop user guide](https://www.tonalenergy.com/tet-user-guide-android)
- [Android Developers — Oboe](https://developer.android.com/games/sdk/oboe)

## 15. Definition of “parity achieved”

Bocal may claim practical TonalEnergy parity only when:

1. P0 and P1 pass their objective tests on the supported device matrix.
2. Recording and the core analysis views in P2 ship, rather than existing only as designs.
3. A professional can save and recall a complete tuner/metronome/tone-generator workflow without navigating more deeply than TonalEnergy.
4. Accessibility and offline behavior are independently checked.
5. Competitive QA uses real rehearsal tasks, not a feature-checkbox count.

Bocal may claim it is **better for saxophone learning** earlier, once the human specialist sign-off, complete interaction tests and instrument/setup learning workflows pass. That is the nearer and more defensible win.
