# Competitive parity and coach audit — 27 August 2026

## Executive position

Bocal is a strong instrument-first prototype, not yet a TonalEnergy replacement. Its advantage can be an unusually clear visual learning path: instrument-specific models, a restrained colour grammar, a local practice narrative and a free core product. It must not make a parity claim until the measurement, timing, playback and professional workflow gaps below are closed and tested on real hardware.

This review uses the current Bocal web source. “Implemented” means present in this codebase, not proven on every browser or Android device.

## 28 August implementation addendum

The parity-foundation branch now closes the first web gaps identified below:

- All supported tuner surfaces use the same calibrated reference and the guitar surface includes Standard, Drop D and Open G string tuning, colour-coded finger charts, and a root-gated chord flow.
- The tuner includes an eight-octave reference-tone keyboard, four safe synthetic voices, volume control and standard/fine/ultra tolerance choices.
- Pulse adds click voices, count-ins, repeatable silent-bar drills and device-local presets while retaining audio-clock scheduling.
- Analyze supports multiple named in-session takes, local audio import, looping, tempo playback, rename, delete and download.
- Practice now records tuner activity, persists the checklist, exposes weekly goals and a low-pressure streak signal, supports song progress, and includes a local coach brief with review-capability coverage and export.

This is a web parity foundation, not a TonalEnergy replacement claim. The remaining gaps are intentionally listed in the matrix and still include region/A-B recording, harmonic/staff/interval analysis, multi-section metronome sequences, MIDI/Ableton Link, synced coach exchange, and physical-device validation.

## What Bocal now provides

| Area | Current capability | Status |
|---|---|---|
| Tuner | Microphone tuner with a noise gate, three-frame lock and 550 ms dropout hold. Alto, oboe and guitar are selectable. | Implemented in web; hardware accuracy/latency not certified. |
| Guitar | Standard, Drop D and Open G open-string tuner views; six basic chord charts with numbered, colour-coded fingers. | Implemented web baseline. |
| Paced chords | A four-chord original practice flow can advance every four beats or wait for three stable frames of the next *root note*. | Implemented; this is not polyphonic chord recognition. |
| Visual learning | Bronze alto/oboe study models with key glows; guitar uses a clear 2D fretboard diagram. | Alto fingering is the only fully documented, validated map. |
| Practice insight | Device-local day activity, tool/type time distribution, note cloud, weekly goal, active-day streak and a gentle progress message. | Implemented from recorded Bocal activity, not fabricated totals. |
| Wishlisted songs | Local title-only wishlist with studying state and a 0–100% player-controlled progress field. One original, playable four-chord practice pattern is included. | Implemented; licensed charts/audio are not yet supplied. |
| Motivation | Small-win acknowledgement without streak pressure or ranking. | Implemented; no rewards economy. |

## TonalEnergy benchmark

TonalEnergy is a paid professional utility, not a chord-course app. Its official guide documents several tuner visualizations and targets, configurable transposition/temperament/reference pitch, pitch tracking, a sophisticated sequence/preset metronome, tone and chord generation, waveform/spectral/harmonic/staff analysis, recording, practice activity and MIDI/external-device workflows. The current Google Play listing showed US$5.99 on the audit date; this is a storefront observation, not a permanent global price. Sources: [TonalEnergy Android/Desktop guide](https://www.tonalenergy.com/tet-user-guide-android), [Google Play listing](https://play.google.com/store/apps/details?hl=en-US&id=com.sonosaurus.tonalenergytuner), and [TonalEnergy Desktop](https://www.tonalenergy.com/te-desktop).

| Capability | Bocal today | TE benchmark | Release priority |
|---|---|---|---|
| Reliable tuner | Basic confidence-gated chromatic pitch estimate | Configurable visuals, targets/ranges, pitch history, reference/temperament/transposition controls | P0 — test and instrument the audio engine first |
| String tuner | Three guitar tunings; nearest-string selection | Broad configurable string instruments/tunings | P1 |
| Metronome | BPM, beat count, subdivision, click voices, count-in, silent-bar drill, drone, saved presets and measured rhythm evidence | Presets, set lists, complex sequences/automation, accents, count-ins and professional timing tools | P0/P1 — add multi-section sequences and external sync |
| Tone/chord generator | Eight-octave calibrated reference keyboard, four synthetic voices, safe level control and chord roots | Keyboard/grid/chord/interval/exercise generator | P1 — add chord/sequence exercise builder and sampled voices |
| Recording/analysis | Named multi-take browser capture/import, playback, loop, tempo control, rename, delete and download; waveform/spectrum remain live | Recording/playback/export plus waveform, pitch, spectrum, harmonics and staff tools | P1 — add markers, regions, A/B and harmonic/staff/interval views |
| Practice history | Local day/type/note activity map, weekly goal, streak nudge, song progress and export | Practice activity and streak/goal support | Implemented locally; add reminders/calendar and cross-device transfer |
| Professional I/O | No MIDI/external mic/Bluetooth routing validation | MIDI and external-device workflows | P1 |
| Coach workflow | Notes/export only; no real teaching exchange | Not TE's primary focus, but table stakes for Bocal's stated coaching ambition | P1 |

The free price target is an advantage only if core measurement is reliable. “Free” must not be presented as price parity for a $5.99 professional tool until Bocal can complete a normal tuning/metronome/record/review session reliably on supported devices.

## Adjacent product comparison

- [Fender Tune Plus](https://support.fender.com/hc/en-us/articles/42912909683739-What-is-Tune-Plus) demonstrates the expected depth of guitar chord content: thousands of chord shapes, variations/tunings, chord diagrams, fingerings, scales and rhythm patterns. Bocal’s six shapes are deliberately a learning prototype, not catalogue parity.
- [Soundbrenner's manual](https://www.soundbrenner.com/pages/manual-the-metronome-app) shows the useful combination of metronome, tuner and practice tracker across phone/wearable contexts. Bocal needs reliable timing and device validation before it claims comparable utility.
- [Yousician's guitar onboarding](https://support.yousician.com/hc/en-us/articles/204738362-Get-started-with-Yousician-guitar) illustrates a clear live-feedback learning path. Bocal's next-step wait is intentionally narrower: it listens for a monophonic root, rather than judging a strummed chord.

## Coach mode: useful local foundation, not yet sufficient for a connected studio

The current code can retain local notes, create a local assignment brief and export it, but it does **not** yet cover a connected coach’s operational needs.

| Coach need | Current state | Needed before a coach-mode launch |
|---|---|---|
| Student roster, consent and roles | Missing | Explicit coach/student roles, age/consent model, access/revocation and privacy policy. |
| Assignments | Local brief only | Versioned assignment with instrument, goal, tempo, tolerance, due date and source/right information. |
| Evidence | Partial local data only | Signed/immutable session evidence with device/test context, optional audio/video consent and clear confidence labels. |
| Review and feedback | Missing | Timeline, passage markers, text/voice annotation, rubric and acknowledgement loop. |
| Group / section visibility | Missing | Aggregated, privacy-aware view; no public rankings by default. |
| Repertoire workflow | Title-only local wishlist plus one original flow | Coach-provided legal chart/PDF references or user imports; Bocal must never distribute unlicensed notation/tab/audio. |
| Hardware reality | Untested | Device matrix for mic, Bluetooth, interruption, rotation, backgrounding, thermal and accessibility. |

A credible first version can remain local-first: a coach creates an encrypted/signed assignment bundle; a learner deliberately imports it; evidence is exported only by the learner; the coach imports the response. Cloud accounts should follow only after the data model and consent flow are sound.

## Wishlist and repertoire status

The current repertoire surface has:

1. A local title-only wishlist that a player can add to, mark as studying and move through with a 0–100% progress control.
2. One original four-chord guitar exercise with a playable chord flow.
3. Explicit labels showing that Bocal has no bundled licensed score, tab, backing-track or commercial-song playback catalogue.

Therefore: user wishlist progress is now **tracked as local titles and self-reported percentages**; playable licensed-song progress is **0** unless the user supplies or licenses content. The next legal/content step is a repertoire schema with provenance (`user supplied`, `public domain`, `licensed`, `original`), a chart/score attachment reference, sections/bars, instrument arrangement and progress checkpoints. Rights must be checked before any song is bundled.

## Recommended delivery order

1. **Trust the measurement:** physical-device tuner accuracy/latency tests, audio interruption/routing tests, a calibrated acceptance harness and reliability telemetry that stays opt-in/local by default.
2. **Complete the core utility suite:** tuner controls, professional metronome presets/sequences, saved tone/chord/drone tools, recording and analysis playback/export.
3. **Make guitar genuinely useful:** a validated chord data engine, common tunings, capo/string-set support, accessible diagrams, tempo-synchronised cursor and carefully labelled monophonic/polyphonic detection.
4. **Make coaching real:** assignment/evidence/feedback bundle format, legal repertoire references, structured rubrics and consent/access controls.
5. **Then extend the delight layer:** optional achievements tied to personal effort, meaningful milestones and richer visual scenes. Never make streak loss or public ranking the main motivator.

## Acceptance criteria for a parity claim

Do not say Bocal has feature parity with TonalEnergy until all are true:

- Clean-clone web and Android builds are reproducible and the advertised artifacts match their source.
- Supported-device test results demonstrate the agreed pitch accuracy, response time, interruption recovery, rotation and Bluetooth/external-mic behavior.
- Tuner, metronome, generator, recording/playback, analysis and saved workflow controls are demonstrably complete enough for a musician to replace their normal TE session.
- Coach and repertoire claims are backed by working consent, assignment, evidence and rights-handling flows.
- Each instrument-facing fingering/chord lesson says what is validated, what it hears, and what it does not infer.
