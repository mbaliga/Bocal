# Bocal — current state

An instrument × capability table, kept as the one place other docs point to instead
of restating instrument counts and feature lists that drift out of date. Generated
by hand from `web-source/app/instruments.ts` and the fingering/sax-lab/oboe-lab
source fixtures as of 18 September 2026; re-check it whenever `INSTRUMENT_ORDER`
or a `labTier` changes.

## Instrument × capability

| Instrument | `labTier` | Tuner | Written↔concert offset | Lab | Known chart/model issues |
|---|---|---|---:|---|---|
| Alto saxophone | fingering | Yes | 9 semitones | 3D fingering trainer, licensed model, with a 2D chart beneath the stage synced to the note browser | Standard range only; altissimo B6/C7 fingerings not confirmed against the cited source |
| Tenor saxophone | fingering | Yes | 14 semitones | Fingering trainer, shown on alto model | Standard range only |
| Soprano saxophone | fingering | Yes | 2 semitones | Fingering trainer, shown on alto model | Standard range only |
| Baritone saxophone | fingering | Yes | 21 semitones | Fingering trainer, shown on alto model; low A3 on the 2D chart | Low A3 is a baritone-only fingering (scoped in `sax-data.ts`); the alto model has no such key, so the lab says so plainly |
| Oboe | anatomy | Yes | 0 | 3D anatomy preview + 2D chart | D6 fingering remains unreviewed against the cited source; renderer scale regression is covered by `model-render.test.mjs` |
| Cor anglais | anatomy | Yes | 7 semitones | 3D anatomy preview (oboe model) + oboe chart | Borrowed chart is trimmed to written B3 and above; specialist review remains outstanding |
| Flute | chart | Yes | 0 | 2D fingering chart, no 3D model | Thumb B♭ and E♭ key omissions against the cited source |
| Clarinet | chart | Yes | 2 semitones | 2D fingering chart, 3D model not licensed | Chart verified against the source; considered the most reliable of the three chart-only instruments |
| Bassoon | chart | Yes | 0 | 2D fingering chart, no 3D model | Missing LH pinky keys against the cited source |
| Diatonic harmonica | harmonica | Yes | 0 | Hole chart: blow row above, draw row below, bends under each cell, twelve selectable keys (default C), overblows and overdraws behind an opt-in toggle | Computed from the standard Richter layout, not teacher-reviewed; overblows and overdraws are marked unverified; bend availability varies by harp and player |
| Chromatic harmonica | harmonica | Yes | 0 | Hole chart for the 12-hole solo-tuned layout with a slide-in toggle (a semitone up) | Computed from the standard layout, not teacher-reviewed; bends are not charted; the layout reaches C♯7, so D7 only sits inside the tuner window |
| Guitar | none | String tuner (no reed/embouchure model) | n/a | Chord fretboard chart + follow player | Follow-player advance is tempo-selectable and scheduled on the AudioContext clock |
| Vocal | vocal | Yes | 0 | Live singing pitch graph with hold, pan and zoom review; self-recorded vocal range; three-step self-paced warm-up whose cards draw on the graph, with pause/resume timer and local completion log; saved vocal takes with the take's own pitch line and an A/B overlay; six target melodies of Bocal's own plus a melody editor, with per-note figures after a pass | Pitch-first support only; no vocal-technique rating or healthy-range claim; the melody figures are pitch only, with no timing or technique judgement; the 80 Hz tracker floor sits above C2; voice-teacher and device review remain |

## Wave 2 (merged 18 September, PR #18) -- present in the code

| Package | State |
|---|---|
| W2-A tuner | `page.tsx` composes `useTuner`, `usePersistedSetting`, `TunerView`, `DownloadCenter` and `storage-keys.ts` (every localStorage key is a named constant; a test enforces it). Manual target-note lock, pitch pipe (press and hold the readout), written/concert readout toggle, dBFS level meter with peak hold and clip indicator, tenth-of-a-cent tracking at Ultra precision, and the tone generator's "Follow my pitch" wired to the live locked reading |
| W2-B analyze | Spectrogram mode, A/B take overlay, take tags/notes with sort and filter, MIDI and MusicXML transcription export |
| W2-C practice | Shared audio scheduler, metronome gap drill and seeded beat drops, exercise library in the tone generator, per-session practice log with rename and delete (`PracticeLog`, `updatePracticeActivity`, `deletePracticeActivity`) |
| W2-E models | Alto body re-segmented into neck/body/bow/bell and oboe body split into top joint/lower joint/bell (`public/models/*.parts.json`, modifications recorded per CC BY 4.0) |
| Sax lab | 2D chart under the 3D stage, `SAX_3D_KEYS` (the baritone low A key is not drawn on the alto model), baritone low-A notice |

## After wave 2: October additions

- Vocal instrument profile: `labTier: "vocal"`, `embouchure: "voice"`, 80-1400 Hz tracker band, `VocalStudio.tsx` three-step warm-up logged as a `vocal` practice activity; competitor scope in `docs/VOCAL_COMPETITOR_ANALYSIS.md`.
- Vocal graph (package V-A): `VocalPitchGraph.tsx` draws the singer's pitch on a dark stage, painted from the tuner's own animation-frame loop. The maths is in `vocal-graph.ts`, the canvas painting in `vocal-graph-canvas.ts`, the range finder in `vocal-range.ts` and the warm-up feedback in `vocal-warmups.ts`; styles are in `styles/vocal.css`.
  - Graph: pitch up the page (C2 to C6 by default, or the stored range with a margin), note names in the chosen notation system, semitone guides and heavier octave lines, 30 s window by default (10 s, 1 min and 2 min presets). The line breaks wherever the voice is silent, and is coloured by cents from the nearest semitone using the tuner's in-tune / near / off bands. A glowing head and a readout mark the current pitch; with reduced motion the glow does not pulse.
  - Data: `useTuner` keeps a second 2-minute ring buffer (`vocalGraph.buffer`) of unsmoothed pitch from every reliable frame, so a slide is drawn as a slide. The Tune view's own 10 s history is unchanged. `StablePitchTracker.lastFrameReliable` is the one new flag read from the tracker.
  - Hold: freezes the picture while the microphone keeps listening. Drag pans time, wheel or two-finger pinch zooms time (5 s to 120 s), a vertical pinch (or Shift and wheel) zooms pitch, and on-screen buttons do the same for keyboard and switch users. Live returns to the scrolling graph. Data older than two minutes is no longer available to pan back to.
  - Range finder: sing a lowest then a highest comfortable note, each held for 2 s; each is the median of the locked readings. Stored under `bocal-vocal-range-v1` (sanitised on read), shown as a shaded band on the graph and a two-bar card with note names and the span in semitones. The copy says it is the range the singer chose to record; it does not label the voice. Clear and Record again are available.
  - Warm-ups: each card keeps its text and manual Mark complete. A separate Show on graph control adds feedback: Sustain draws a target band (tap a note name on the graph, or choose it, or take the tuner's locked note) and fills a ring while the pitch stays in the band (the Precision setting, never narrower than 10 cents); Glide draws a sine-shaped siren path between two notes and the voice is drawn over it; Start cleanly ticks each attack that follows at least 300 ms of silence. These show what was sung. They do not mark it.
- Play-along (package V-C): a "repeat after me" drill, `CallAndResponse.tsx`, mounted in three places: under the tone generator in the Tune workspace, in the Vocal studio (it fills the `V-C: play-along` slot named above) and in the sax lab's Learn mode. Bocal plays a short phrase through the tuner's one AudioContext (every note is queued on the audio clock, never a timer), gives one beat, then listens for 1.5 times the phrase length and shows the phrase as note bands with a tick or cross for each note and the notes it heard drawn inside them. The logic is in `call-response.ts` (no DOM, no audio): `idle`, `playing`, `listening`, `scored`, then Again or Next. Heard notes are found with the same stable-segment detection the Tune staff uses and matched to the phrase in order; a note is matched when its middle pitch sits inside the band and it was held for at least 60% of its written length. Three settings, all Bocal's own: lenient (±25 cents, 60% of notes), standard (±15, 80%) and strict (±8, every note). The right note in the wrong octave is not matched, and an extra sung note is ignored. Timing is never judged. The result is "matched" or "not yet", never a mark.
  - Pitch space: a phrase is stored and judged in concert pitch and shown in written pitch (alto sax +9, clarinet +2, voice, flute, harmonica and guitar 0). Non-voice instruments have the phrase moved by whole octaves to sit in their range; every instrument can go one octave up or down.
  - Phrases: three of Bocal's own (five-note scale, arpeggio, descending fifth), the six bundled melodies and the singer's own from the melody line (the Vocal stage passes them through the `phrases` prop), and the player's saved exercises, which are usable because a pattern expands to notes of one beat each at the exercise's tempo (cut to eight notes; the harmonic series is left out because its partials are not equal-tempered notes). `CallPhrase` is the melody line's `Melody` type without its `source` tag; phrases longer than 16 notes are cut to 16 for the drill.
  - Controls and records: phrase, octave, how close, tries per phrase, and "move on by itself" (a matched round goes to the next phrase, an unmatched one repeats until the tries run out) are kept under `bocal-call-response-v1`. Each phrase worked on is logged once as practice activity (`vocal` for voice, `tuning` otherwise) with the phrase name, the number of attempts and the attempt it was matched on. Without a started microphone the drill says so and offers the listen button; Start then waits for the microphone and begins by itself.
  - Wiring: `useTuner` publishes `callHost` (see `call-host.ts`: the vocal buffer, `schedulePhrase`, both clocks, and the buffer's pitch offset) so the sax lab can mount the drill without being handed the tuner. Not built: a recording of the attempt, timing or rhythm feedback, and any rating of the voice or playing.
- Vocal takes and melody targets (package V-B), mounted in the `V-B: takes` and `V-B: melody` slots of `VocalStudio.tsx`.
  - Takes (`VocalTakes.tsx`): Record take on the Vocal stage uses the Analyze recorder's rules without change: the same capture gate, the same 12-take library that never evicts (instrument takes from Analyze count toward the 12), and a write only counts as saved once the IndexedDB transaction commits. A vocal take is stored with `kind: "vocal"` (`takes-store.ts`, cleaned by `sanitizeTakeKind` on write and read); a take without the field is an instrument take, so everything saved before this change reads back as it did. Each take is listed with its name, date and length, and can be played back, renamed, exported through the existing save path (`saveOrShareFile`) and deleted after a confirmation. Recording opens its own microphone stream (no second AudioContext), so the live graph only moves while the microphone above is started.
  - Take playback: `TakePitchTrace` draws the take's pitch line, read from the audio by `pitchTrackFrames` as in Analyze, over its waveform. It gets one new optional `vocal` prop: the pitch axis then comes from the vocal graph's scaling (`takePitchView`, built on `defaultPitchView` and `pitchTicks`: the stored range, or the take's own notes if none is stored), the colour bands use the stage's tolerance, and the instrument-only held-note statistics are left out. Another vocal take can be laid over it, aligned by start or by first note, using the wave 2 overlay unchanged. `AnalysisView.tsx` is unchanged and still lists every take.
  - Melodies (`melody-line.ts`, `MelodyTarget.tsx`): a melody is `{ id, name, tempoBpm, notes: { midi, beats }[], source }` with 1 to 64 notes, MIDI 24 to 96, 0.25 to 16 beats and 30 to 240 BPM. Six are bundled and labelled as Bocal's own exercises (five-note scale, arpeggio, octave leap, siren as two long notes, descending fifth, sustained third); the singer's own are stored under `bocal-vocal-melodies-v1` and cleaned by `sanitiseMelodies`. The editor takes notes from a picker or from a tap on the graph's note names, each with a length in beats. Any melody can be started on another note.
  - A pass: Play pass schedules every note as a reference tone on the tuner's AudioContext clock (`playReference` now also accepts a list of tones; no timer decides when a note sounds) after a 1.2 s lead-in. The graph pins its time window to the pass, draws each note as a band (the Sustain band width) and the singer's line over it. The notes can be switched off to sing to the bands alone. Afterwards each note shows the average distance of the sung pitch in cents and the time it spent inside the band (`noteStatistics`). The copy says this is pitch information only, with no timing or technique judgement and no mark; a note that was never sung says so.
  - Not measured: when a note was started or left, how it sounded, or anything about technique. A microphone reading arrives a little after the sound, so the first moments of a note are partly the singer finding the pitch.
- Flute coaching direction (`CORRECTION_COPY["air-reed"]`): rolling in covers more of the hole and lowers pitch, so a sharp flute rolls in and a flat flute rolls out.
- Android `beta` flavour (the only variant with the INTERNET permission, for the optional local session bridge); the standard flavour stays offline-only.
- Release workflow gates and `android/verify-aab.sh`; CC BY 4.0 licence-text links beside both model credits.

## Harmonicas (V-D)

Two profiles, both concert pitch (offset 0), both `labTier: "harmonica"`, family "Free reed", `embouchure: "free-reed"` (the tuner's sharp/flat coaching talks about breath and mouth shape, never a jaw or lip). The hole chart is generated by `web-source/app/fingering-charts/harmonica.ts` (registered as `HARMONICA_CHARTS` in that folder's `index.ts`) and drawn by `HarmonicaChart.tsx`; the page routes to it for the "Chart" tab and passes the tuner's locked note, so the hole being played lights up. The diatonic key is saved under `bocal-harmonica-key-v1` and read back through `sanitiseHarmonicaKey`. Every chart is badged "Standard Richter layout, computed, not teacher-reviewed." (the chromatic says "solo-tuned layout" in place of "Richter", because it is not Richter tuned) with a line that bend availability varies by harp and player. The gallery cards carry no image: none has been licensed for commercial use.

Naming: "harmonica" is the standard English name, "mouth organ" is the informal name, and it is a free reed wind instrument.

## Navigation

On a phone the dock has two curves. The lower arc moves between the five workspaces (Tune, Lab, Pulse, Analyze, Practice). The upper pill is a two-seat view switch for the workspace on screen, and each seat drives a control that workspace already has. The instrument picker at the top left is the only place to choose an instrument; the pill no longer lists instruments. The dock appears on screens up to 680 px wide; wider screens use the side rail with no pill, and the short phone-landscape layout hides the pill, so in both the in-view controls are the way to the same views.

The left seat is the default. The pairs are defined in `web-source/app/context-seats.ts`, and the last seat chosen in each workspace is kept under `bocal-context-seats-v1`:

| Workspace | Seats | What they do |
|---|---|---|
| Tune, transposing instruments | Written / Concert | The Readout setting in Calibration; the pill and that control are one setting (`bocal-tuner-display-mode`) |
| Tune, instruments with no transposition | Tuner / Tone | Scroll to the tuner, or to the tone generator |
| Pulse | Metronome / Sequences | Scroll to the metronome, or to the sequence builder |
| Analyze | Waveform / Spectrum | The analysis view buttons; Harmonics and Spectrogram are still reached from the view, and then neither seat is lit |
| Practice | Today / Log | Scroll to today's plan, or to the practice log |
| Lab, saxophones | Learn / Challenge | The lab's own trainer switch |
| Lab, oboe and cor anglais | Front / Left | The first two camera presets of the 3D view |
| Lab, flute, clarinet, bassoon, diatonic harmonica | Chart / Tune | Scroll to the chart, or open the tuner |
| Lab, chromatic harmonica | Slide out / Slide in | The chart's slide toggle |
| Lab, vocal | Graph / Warm-ups | Scroll to the live pitch graph, or to the guided warm-up |
| Lab, guitar | Tuner / Chords | Scroll to the string tuner, or to the chord player |

A seat that scrolls moves focus to the section's heading. A stored seat is scrolled to again when its workspace opens, but the pill does not follow your scrolling afterwards, so it shows the last seat chosen, not where the page happens to be.


### Touch targets

On touch screens (`pointer: coarse` or `hover: none`, which covers the Android WebView) every control has a hit area of at least 44 by 44 CSS px, in both themes, on every workspace, at 412 and 360 px wide. `web-source/app/styles/touch-targets.css` does this: chips, segmented buttons, selects, text inputs and buttons grow to 44 px; controls that would look wrong enlarged (beat dots, switch toggles, the Reset and status text buttons, model credit links, the context pill and arc seats, the exercise-chip edit and delete discs) keep their look and extend the hit area with an invisible `::after`. `web-source/tests/tap-targets.mjs` (part of `npm run test:e2e`) hit-tests every interactive element and fails below 44 px. Exempt, with reasons listed in the test: the visually hidden skip link (it grows on focus), anything inside a canvas, native range sliders (the thumb is the target; the input must be at least 32 px tall and, with padding, 44 px for the hit area) and inline text links inside paragraphs (24 px, WCAG 2.5.8). On phones the invisible 14 px "Keyboard" shortcut button is hidden; keyboard help stays in Settings.

## Cross-cutting state

| Area | State |
|---|---|
| Fingering/anatomy review | None reviewed by a qualified teacher; every chart and the sax altissimo set carry a "not yet teacher-reviewed" badge |
| 3D rendering | Bronze is the default; the Look panel applies local material, keywork, mouthpiece, environment and camera controls without changing geometry |
| Takes/recordings (Analyze, Vocal) | IndexedDB-backed local persistence when available, with a session-only fallback; no uploads. One 12-take library is shared by Analyze and the Vocal stage; a take recorded on the Vocal stage is tagged `kind: "vocal"` |
| Practice data | Local `localStorage`, deterministic skill-rating from recorded evidence (no synthetic/demo numbers) |
| Android shell | WebView wrapper over this web build; two third-party glTF models ship (alto sax, oboe); no signed release build exists |
| Tests | Source tests cover product truth, chart invariants, model scale, and local persistence; `test:e2e` and `test:theme` are explicit browser gates |

## Where the fuller detail lives

- Instrument and lab-tier source of truth: `web-source/app/instruments.ts`.
- Fingering chart data and per-instrument fixtures: `web-source/app/fingering-charts/`.
- Full narrative handoff: `docs/BOCAL_HANDOFF.md`.
- Detailed implementation evidence: `web-source/tests/`, `android/static-check.sh`,
  `android/device-release-check.sh`, and `android/verify-aab.sh`. The remaining
  release gates are physical-device testing, teacher review, model-license
  confirmation, and a real signed Play bundle.
