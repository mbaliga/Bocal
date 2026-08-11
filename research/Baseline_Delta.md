# Delta: supplied “Baseline for Music” brief versus this handoff

The supplied brief is strategically strong on local-first Android engineering, clean-room DSP/licensing, color-safe feedback, modular boundaries, local data and phased coaching. It is not a TonalEnergy parity specification, an interactive-instrument content system, or a complete product/user-research handoff. This delivery keeps its strongest decisions and corrects or expands the missing parts.

## What is retained

| Baseline decision | Handoff treatment |
|---|---|
| Native Kotlin + Jetpack Compose, min SDK 26 | Retained in the Android reference project. |
| Backendless core and no Android `INTERNET` permission | Retained. The 3D lab is packaged as local app assets through `WebViewAssetLoader`. |
| Clean-room YIN/MPM direction; avoid GPL TarsosDSP/pYIN | Retained. Both web and Android references include original YIN-style difference/CMND code; no GPL DSP library is included. |
| Oboe/AAudio as production low-latency direction | Retained as target architecture; compact reference uses `AudioRecord` because the environment lacks NDK/Oboe build tooling. |
| SwiftF0/ONNX only as a candidate, with validation/fallback | Retained as an experiment lane, not presented as production truth. |
| Timbre as descriptive brightness/harmonic/stability evidence | Retained. The web reference implements waveform, relative harmonic energy and cautious descriptors. |
| Room/local files/versioned export | Retained as production architecture. Reference source uses browser local storage or Android SharedPreferences/JSON to stay compact; Room migration is a production milestone. |
| Color must not be the only status encoder | Retained and expanded to TalkBack/structured-list/non-3D requirements. |
| Equipment, journal, repertoire and coach exchange | Retained in the roadmap and persona workflows. |
| File-based exchange before a server/account system | Retained. JSON export is implemented as the schema foundation. |

## What the baseline omitted and this handoff adds

| Missing area | Added deliverable |
|---|---|
| Actual incumbent breadth | An 84-row parity matrix built from TonalEnergy's official Android/Desktop guide and mobile page, with working/partial/planned status and acceptance evidence. |
| Persona coverage | Ten primary personas and exactly five priority workflows each (50 total), plus a shared six-stage journey. |
| Information architecture | Six top-level verbs—Tune, Lab, Pulse, Sound, Analyze, Practice—with progressive disclosure instead of a settings-heavy clone. |
| 3D content pipeline | Original pure-Python generator, catalog/schema, 35 validated GLBs, 465 named interactive controls, licensing and a structural validator. |
| Saxophone family breadth | Ten sax models, including all six Yamaha-identified widespread types plus soprillo, C melody, contrabass and subcontrabass. |
| Woodwind expansion | Flute, clarinet, oboe/double-reed, bassoon and recorder families in the catalog. |
| Educational-content governance | Review state in the catalog; note-level claims gated until specialist approval; version/errata workflow and acceptance criteria. |
| Usable static product | Standalone Vite/Three.js build with audio tuner, metronome, tone, analysis, practice/recording and local 3D lab. |
| Native source | Android Studio project with Compose UI, AudioRecord YIN tuner, pulse, reference tone, analysis snapshot, journal and embedded offline 3D lab. |
| Delivery truthfulness | Explicit APK build status and a validator that rejects a renamed ZIP as an APK. |
| Competitive path | Prioritized milestones, parity acceptance evidence, instrumentation and release gates. |

## Corrections and risk adjustments

### 1. “Full parity” is a program, not an MVP adjective

The supplied brief is centered on tuner/journal/equipment/coaching. TonalEnergy's documented surface also includes deep metronome preset programming, tempo and meter automation, sound libraries, auto-reference tones, custom temperament editing/export, note staff and interval training, recording organization/editing/time/pitch changes, MIDI/Link/BodyBeat/external display, language/notation choices, and accessibility. Those now appear in the matrix rather than disappearing behind “advanced.”

### 2. Latency target needs layered definitions

The brief's “under 20 ms glass-to-glass” aspiration mixes audio callback interval, pitch-estimator window length, scheduling and display latency. A 2048-sample window at 48 kHz spans about 42.7 ms of signal even if callbacks arrive faster. Production targets should therefore report:

- input callback/buffer latency;
- estimator algorithmic window and hop;
- time to stable pitch after onset;
- UI publication-to-photon time;
- end-to-end user-observed response by device/audio route.

The product can still feel immediate with frequent overlapping updates, but it must not market a number that was not measured under a defined protocol.

### 3. No Internet permission is powerful but not the whole privacy story

On-device access may not count as “collected” under the Play definition when nothing leaves the device, but Bocal still needs accurate microphone/recording disclosures, a privacy policy, retention/export/delete controls, backup behavior, minor/guardian decisions and a review of every dependency. Browser hosting also necessarily transfers ordinary web-request metadata to the chosen host, even though app audio is not uploaded by the supplied code.

### 4. SwiftF0 is a hypothesis for this domain

Published size/speed/noise benchmarks are encouraging. They do not establish sax altissimo behavior, multi-source rehearsal behavior, latency on target Android devices, or superiority over optimized clean-room DSP for sustained monophonic woodwinds. It belongs behind the same detector interface and must earn promotion through golden-corpus tests.

### 5. “All woodwinds” needs a declared taxonomy

No finite consumer release can model every historical, regional and experimental woodwind. This handoff defines launch coverage as the common orchestral/band families in Yamaha's overview plus useful variants: 35 models across saxophones, flutes, clarinets, double reeds and recorders. World flutes, free reeds, historical systems and niche hybrids are an expansion registry, not silently implied as complete.

### 6. Visual accuracy and fingering accuracy are different approvals

A recognizable silhouette can pass visual review while a key mapping is wrong; a correct basic chart can still omit alternate/trill/altissimo/manufacturer-specific context. The pack therefore separates `modelStatus`, `reviewStatus`, key metadata and fingering data. Only alto sax core range is wired to notes in this reference, and even it must receive named expert sign-off before a store claim.

### 7. Backendless constrains some parity and education workflows

File exchange, OS sharing and local-network/external protocols can cover much of the job. Organization provisioning, cross-device sync, shared libraries and cohort dashboards are materially harder without a service. Bocal should keep the core offline and make any later network module optional, explicit and separable instead of treating the tradeoff as nonexistent.

### 8. Open/closed modularity should follow validated product value

The baseline's large multi-module split is sensible at scale but expensive before domain behavior stabilizes. The delivered Android reference is intentionally one app module with clear package boundaries. Extract `audio`, `pitch`, `model-data`, `haptics`, `bundle` and `baseline` only after contracts have tests and at least two consumers or a real licensing reason.

## Net assessment

The baseline is a good engineering strategy memo. This handoff turns it into a product-development package: competitor inventory, personas/jobs, journeys, acceptance criteria, working static reference, native source, an interactive asset pipeline, content-governance gates, and a realistic parity roadmap. The remaining delta is not more prose—it is specialist validation, measured DSP/device evidence, native build/device testing, sound-content production, and sustained implementation of the P0/P1 backlog.
