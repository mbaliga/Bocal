"use client";

import { Check, Circle, Crosshair, Eraser, Mic2, Music2, Pause, Play, RotateCcw, Square, Target, Volume2, Waves } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fullNoteLabel, type NotationSystem } from "./notation";
import type { PitchHistorySample } from "./pitch-history";
import { recordPracticeActivity } from "./practice-data";
import "./styles/vocal.css";
import { VOCAL_RANGE_KEY } from "./storage-keys";
import { usePersistedSetting } from "./usePersistedSetting";
import { PRECISION_TOLERANCE } from "./useTuner";
import { VocalPitchGraph } from "./VocalPitchGraph";
import { clamp } from "./music-math";
import { defaultPitchView, formatSignedCents, samplePitch, splitPitch, type VocalGraphSource } from "./vocal-graph";
import { EMPTY_OVERLAY, type GraphOverlay } from "./vocal-graph-canvas";
import {
  RangeCapture,
  barFraction,
  buildVocalRange,
  octaveSpanLabel,
  parseVocalRange,
  semitoneCountLabel,
  serializeVocalRange,
  type VocalRange,
} from "./vocal-range";
import {
  GLIDE_DURATION_MS,
  OnsetDetector,
  SUSTAIN_FILL_MS,
  SUSTAIN_MIN_BAND_CENTS,
  SustainMeter,
  makeGlideAttempt,
  sustainBandCents,
} from "./vocal-warmups";

const ROUTINE_STEPS = [
  { id: "sustain", label: "Sustain", title: "Hold one vowel", detail: "Choose a comfortable note, sing “ah” or “oo”, and keep the sound easy and even for four slow counts." },
  { id: "glide", label: "Glide", title: "Trace a gentle siren", detail: "Slide between two easy pitches. Stay in a comfortable range and stop if your voice feels strained." },
  { id: "start", label: "Start cleanly", title: "Repeat a short phrase", detail: "Take a quiet breath, begin without a hard push, then leave a little space before trying again." },
];

type StepId = "sustain" | "glide" | "start";
type RangeStep = "idle" | "low" | "high";

const RING_RADIUS = 34;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const MAX_ONSET_MARKS = 24;
const DEFAULT_SUSTAIN_MIDI = 57;
const DEFAULT_CHOICE_LOW = 36;
const DEFAULT_CHOICE_HIGH = 84;

const parseStoredRange = (raw: string | null) => (raw === null ? undefined : parseVocalRange(raw));

function noteChoices(range: VocalRange | null): number[] {
  const low = range ? range.low : DEFAULT_CHOICE_LOW;
  const high = range ? range.high : DEFAULT_CHOICE_HIGH;
  const choices: number[] = [];
  for (let midi = low; midi <= high; midi += 1) choices.push(midi);
  return choices;
}

export type VocalStudioProps = {
  onOpenTune: () => void;
  /** Whether the shared tuner (one AudioContext for the whole workspace) is listening. */
  listening: boolean;
  /** Starts the tuner, or stops it when it is already listening. */
  onListen: () => void;
  micMessage: string;
  /** The tuner's vocal buffer and frame feed. */
  graph: VocalGraphSource;
  notation: NotationSystem;
  saTonic: number;
  precision: "standard" | "fine" | "ultra";
  /** The note locked in the Tune view, if any. */
  lockedTargetMidi: number | null;
  /** The tuner's existing reference-tone path. */
  playReference?: (midi: number) => void;
};

export function VocalStudio({
  onOpenTune,
  listening,
  onListen,
  micMessage,
  graph,
  notation,
  saTonic,
  precision,
  lockedTargetMidi,
  playReference,
}: VocalStudioProps) {
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const finishRoutine = () => {
    setRunning(false);
    if (elapsedSeconds > 0) {
      recordPracticeActivity({
        type: "vocal",
        seconds: elapsedSeconds,
        instrumentId: "vocal",
        notes: ROUTINE_STEPS.filter((step) => completed.includes(step.id)).map((step) => step.label),
        label: "Vocal warm-up",
      });
    }
    setHasStarted(false);
    setSaved(true);
  };

  const resetRoutine = () => {
    setRunning(false);
    setElapsedSeconds(0);
    setHasStarted(false);
    setCompleted([]);
    setSaved(false);
  };

  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  // -- The graph and what is drawn on it ------------------------------------

  const [range, setRange] = usePersistedSetting<VocalRange | null>(VOCAL_RANGE_KEY, parseStoredRange, null, serializeVocalRange);
  const overlayRef = useRef<GraphOverlay>({ ...EMPTY_OVERLAY, onsets: [] });
  const [revision, setRevision] = useState(0);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [sustainTarget, setSustainTarget] = useState(DEFAULT_SUSTAIN_MIDI);
  const [glideFrom, setGlideFrom] = useState<number | null>(null);
  const [glideTo, setGlideTo] = useState<number | null>(null);
  const [glideRunningNow, setGlideRunningNow] = useState(false);
  const [reachedFor, setReachedFor] = useState<number | null>(null);
  const [onsetInfo, setOnsetInfo] = useState<{ count: number; label: string }>({ count: 0, label: "" });
  const [notice, setNotice] = useState("");

  const choices = noteChoices(range);
  const choiceLow = choices[0];
  const choiceHigh = choices[choices.length - 1];
  const targetMidi = clamp(sustainTarget, choiceLow, choiceHigh);
  const glideDefaultFrom = clamp(range ? range.low + 2 : 55, choiceLow, choiceHigh);
  const fromMidi = clamp(glideFrom === null ? glideDefaultFrom : glideFrom, choiceLow, choiceHigh);
  const toMidi = clamp(glideTo === null ? Math.min(choiceHigh, fromMidi + 7) : glideTo, choiceLow, choiceHigh);
  const toleranceCents = PRECISION_TOLERANCE[precision];
  const bandCents = sustainBandCents(toleranceCents);
  const sustainReached = activeStep === "sustain" && reachedFor === targetMidi;

  const sustainRef = useRef(new SustainMeter());
  const onsetsRef = useRef(new OnsetDetector());
  const captureRef = useRef(new RangeCapture());
  const ringRef = useRef<SVGCircleElement | null>(null);
  const sustainTextRef = useRef<HTMLSpanElement | null>(null);
  const captureFillRef = useRef<HTMLDivElement | null>(null);
  const lastSustainText = useRef("");

  // The sustain band follows the target note and the Precision setting.
  // Layout effect so the graph's repaint (a passive effect keyed on
  // `overlayKey`) always sees the new band.
  useLayoutEffect(() => {
    overlayRef.current.sustain = activeStep === "sustain" ? { midi: targetMidi, bandCents, reached: false } : null;
    sustainRef.current.reset();
    lastSustainText.current = "";
  }, [activeStep, targetMidi, bandCents]);

  const overlayKey = `${revision}|${activeStep}|${targetMidi}|${bandCents}`;

  const selectStep = (step: StepId) => {
    const next = activeStep === step ? null : step;
    overlayRef.current.glide = null;
    overlayRef.current.onsets = [];
    onsetsRef.current.reset();
    setGlideRunningNow(false);
    setOnsetInfo({ count: 0, label: "" });
    setReachedFor(null);
    setActiveStep(next);
    setRevision((value) => value + 1);
  };

  const glideTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (glideTimerRef.current !== null) window.clearTimeout(glideTimerRef.current);
  }, []);

  const startGlide = useCallback(() => {
    if (!listening) {
      setNotice("Start the microphone first, then begin the siren.");
      return;
    }
    setNotice("");
    overlayRef.current.glide = makeGlideAttempt(performance.now(), fromMidi, toMidi);
    setGlideRunningNow(true);
    setRevision((value) => value + 1);
    if (glideTimerRef.current !== null) window.clearTimeout(glideTimerRef.current);
    glideTimerRef.current = window.setTimeout(() => setGlideRunningNow(false), GLIDE_DURATION_MS + 2400);
  }, [listening, fromMidi, toMidi]);

  const stopGlide = () => {
    if (glideTimerRef.current !== null) window.clearTimeout(glideTimerRef.current);
    overlayRef.current.glide = null;
    setGlideRunningNow(false);
    setRevision((value) => value + 1);
  };

  const pickSustainNote = useCallback((midi: number) => {
    setSustainTarget(midi);
    setActiveStep("sustain");
  }, []);

  // -- Range finder -------------------------------------------------------------

  const [rangeStep, setRangeStep] = useState<RangeStep>("idle");
  const [capturePhase, setCapturePhase] = useState<"waiting" | "holding">("waiting");
  const [pendingLow, setPendingLow] = useState<number | null>(null);
  const [rangeNotice, setRangeNotice] = useState("");
  const rangeStepRef = useRef<RangeStep>("idle");
  const pendingLowRef = useRef<number | null>(null);

  const setStep = (step: RangeStep) => {
    rangeStepRef.current = step;
    setRangeStep(step);
  };

  const beginRange = () => {
    captureRef.current.reset();
    pendingLowRef.current = null;
    setPendingLow(null);
    overlayRef.current.capturedLow = null;
    setCapturePhase("waiting");
    setRangeNotice("");
    setStep("low");
    setRevision((value) => value + 1);
    if (!listening) onListen();
  };

  const cancelRange = () => {
    captureRef.current.reset();
    pendingLowRef.current = null;
    setPendingLow(null);
    overlayRef.current.capturedLow = null;
    setStep("idle");
    setRangeNotice("");
    setRevision((value) => value + 1);
  };

  const clearRange = () => {
    cancelRange();
    setRange(null);
    setRangeNotice("Range cleared. The graph is back to C2 to C6.");
  };

  // -- One handler for every tuner frame ----------------------------------------

  const activeStepRef = useRef<StepId | null>(null);
  const fullNoteLabelRef = useRef((midi: number) => fullNoteLabel(midi, notation, saTonic));
  useEffect(() => {
    activeStepRef.current = activeStep;
    fullNoteLabelRef.current = (midi: number) => fullNoteLabel(midi, notation, saTonic);
  });

  const handleFrame = useCallback((sample: PitchHistorySample) => {
    const pitch = samplePitch(sample);
    const overlay = overlayRef.current;

    if (overlay.sustain) {
      const meter = sustainRef.current;
      meter.push(sample.tMs, pitch, overlay.sustain.midi, overlay.sustain.bandCents);
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_LENGTH * (1 - meter.fill));
      const text = `${(meter.inBandMs / 1000).toFixed(1)} s in the band`;
      if (sustainTextRef.current && text !== lastSustainText.current) {
        lastSustainText.current = text;
        sustainTextRef.current.textContent = text;
      }
      if (meter.reached && !overlay.sustain.reached) {
        overlay.sustain.reached = true;
        setReachedFor(overlay.sustain.midi);
      }
    }

    const onset = onsetsRef.current.push(sample.tMs, pitch);
    if (onset) {
      // Marks are only kept while the Start cleanly card is open.
      if (activeStepRef.current === "start") {
        overlay.onsets = overlay.onsets.concat(onset).slice(-MAX_ONSET_MARKS);
        const { midi, cents } = splitPitch(onset.pitch);
        setOnsetInfo((current) => ({
          count: current.count + 1,
          label: `${fullNoteLabelRef.current(midi)}, ${formatSignedCents(cents)}¢`,
        }));
      }
    }

    const step = rangeStepRef.current;
    if (step !== "idle") {
      const capture = captureRef.current;
      const result = capture.push(sample.tMs, sample.locked ? pitch : null);
      if (captureFillRef.current) captureFillRef.current.style.width = `${Math.round(capture.progress(sample.tMs) * 100)}%`;
      setCapturePhase(capture.phase === "holding" ? "holding" : "waiting");
      if (result) {
        capture.reset();
        if (step === "low") {
          pendingLowRef.current = result.midi;
          setPendingLow(result.midi);
          overlay.capturedLow = result.midi;
          rangeStepRef.current = "high";
          setRangeStep("high");
          setCapturePhase("waiting");
          if (captureFillRef.current) captureFillRef.current.style.width = "0%";
        } else if (pendingLowRef.current !== null) {
          const built = buildVocalRange(pendingLowRef.current, result.midi, Date.now());
          if (built.range) {
            setRange(built.range);
            overlay.capturedLow = null;
            pendingLowRef.current = null;
            setPendingLow(null);
            rangeStepRef.current = "idle";
            setRangeStep("idle");
            setRangeNotice("Range saved on this device.");
          } else {
            setRangeNotice("That note was not above your lowest one. Sing a higher note, or start again.");
          }
        }
      }
    }
  }, [setRange]);

  const noteLabel = (midi: number) => fullNoteLabel(midi, notation, saTonic);
  const lockedChoice = lockedTargetMidi !== null && lockedTargetMidi >= choiceLow && lockedTargetMidi <= choiceHigh ? lockedTargetMidi : null;

  const noteSelect = (id: string, label: string, value: number, onChange: (midi: number) => void) => (
    <label className="vocal-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {choices.map((midi) => <option key={midi} value={midi}>{noteLabel(midi)}</option>)}
      </select>
    </label>
  );

  const scaleLow = range ? Math.min(DEFAULT_CHOICE_LOW, range.low - 2) : DEFAULT_CHOICE_LOW;
  const scaleHigh = range ? Math.max(DEFAULT_CHOICE_HIGH, range.high + 2) : DEFAULT_CHOICE_HIGH;
  const viewPreview = defaultPitchView(range);

  return (
    <div className="content-wrap vocal-studio">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Vocal · singing</p>
          <h1>Find the centre of your voice.</h1>
          <p>Follow a short, self-paced warm-up. The graph draws the pitch you sing as you sing it, and the Tune view keeps its own note display and history. Bocal does not rate vocal technique.</p>
        </div>
        <button className="button primary" onClick={onOpenTune}><Crosshair size={16} /> Open live tuner</button>
      </header>

      <section className="vocal-stage" aria-labelledby="vocal-stage-title">
        <header className="vocal-stage-head">
          <div>
            <span className="vocal-stage-kicker"><Mic2 size={14} /> Live pitch</span>
            <h2 id="vocal-stage-title">Your pitch, as you sing it</h2>
          </div>
          <ul className="vocal-legend" aria-label="Line colours">
            <li><i data-band="in" aria-hidden="true" /> Within {toleranceCents}&cent; of a note</li>
            <li><i data-band="near" aria-hidden="true" /> Up to {toleranceCents * 3}&cent;</li>
            <li><i data-band="off" aria-hidden="true" /> Further out</li>
          </ul>
        </header>
        <VocalPitchGraph
          source={graph}
          listening={listening}
          onListen={onListen}
          micMessage={micMessage}
          notation={notation}
          saTonic={saTonic}
          toleranceCents={toleranceCents}
          range={range}
          overlayRef={overlayRef}
          overlayKey={overlayKey}
          onFrame={handleFrame}
          onPickNote={pickSustainNote}
        >
          {rangeStep !== "idle" && (
            <div className="vocal-capture-hud" role="status">
              <strong>{rangeStep === "low" ? "Step 1 of 2 · lowest comfortable note" : `Step 2 of 2 · highest comfortable note${pendingLow !== null ? ` (lowest: ${noteLabel(pendingLow)})` : ""}`}</strong>
              <span>{!listening ? "The microphone is off. Start it to record." : capturePhase === "holding" ? "Keep the note steady…" : "Sing the note and hold it for two seconds."}</span>
              <div className="vocal-capture-bar" aria-hidden="true"><div ref={captureFillRef} /></div>
            </div>
          )}
        </VocalPitchGraph>
        <p className="vocal-stage-note">Tap a note name down the left edge to aim the Sustain band at it. Hold freezes the picture for review while the microphone keeps listening.</p>
      </section>

      {/* V-B: takes */}
      {/* V-B: melody */}

      <section className="vocal-range" aria-labelledby="vocal-range-title">
        <header className="vocal-range-head">
          <div>
            <span className="card-kicker"><Target size={15} /> Vocal range · your own record</span>
            <h2 id="vocal-range-title">Record your range</h2>
            <p>Sing the lowest note that feels comfortable and hold it for two seconds, then do the same for your highest. Bocal records the middle of the pitches it hears for each. This is the range you chose to record on this device, nothing more: it does not label or rank your voice, and it says nothing about what suits it.</p>
          </div>
          <div className="vocal-range-actions">
            {rangeStep === "idle" ? (
              <button type="button" className="button secondary" onClick={beginRange}>{range ? <><RotateCcw size={15} /> Record again</> : <><Mic2 size={15} /> Record my range</>}</button>
            ) : (
              <button type="button" className="button secondary" onClick={cancelRange}><Square size={14} /> Cancel</button>
            )}
            {range && rangeStep === "idle" && <button type="button" className="button secondary" onClick={clearRange}><Eraser size={15} /> Clear range</button>}
          </div>
        </header>
        <p className="vocal-range-notice" aria-live="polite">{rangeNotice}</p>
        {range ? (
          <div className="vocal-range-card" role="group" aria-label={`Recorded range: lowest ${noteLabel(range.low)}, highest ${noteLabel(range.high)}, ${semitoneCountLabel(range)}`}>
            {[{ id: "low", title: "Lowest", midi: range.low }, { id: "high", title: "Highest", midi: range.high }].map((bar) => (
              <div className="vocal-range-row" key={bar.id}>
                <span className="vocal-range-name">{bar.title}</span>
                <strong>{noteLabel(bar.midi)}</strong>
                <div className="vocal-range-track" aria-hidden="true"><div style={{ width: `${Math.round(barFraction(bar.midi, scaleLow, scaleHigh) * 100)}%` }} data-bar={bar.id} /></div>
              </div>
            ))}
            <p className="vocal-range-span">
              <strong>{semitoneCountLabel(range)}</strong>
              {octaveSpanLabel(range) !== semitoneCountLabel(range) ? <> · {octaveSpanLabel(range)}</> : null}
              <small>Recorded {new Date(range.savedAt).toLocaleDateString()} · the graph now spans {noteLabel(Math.ceil(viewPreview.lo))} to {noteLabel(Math.floor(viewPreview.hi))}</small>
            </p>
          </div>
        ) : (
          <p className="vocal-range-empty">No range recorded yet. The graph shows C2 to C6 until you record one.</p>
        )}
      </section>

      <section className="vocal-routine" aria-labelledby="vocal-routine-title">
        <header className="vocal-routine-head">
          <div><span className="card-kicker"><Mic2 size={15} /> Guided warm-up · self-paced</span><h2 id="vocal-routine-title">Three easy steps</h2><p>Pause between steps whenever you need. Keep every sound in a comfortable range.</p></div>
          <div className="vocal-routine-clock" aria-live="off"><small>SESSION</small><strong>{elapsedLabel}</strong></div>
        </header>
        <div className="vocal-studio-grid">
          {ROUTINE_STEPS.map((step, index) => {
            const isComplete = completed.includes(step.id);
            const id = step.id as StepId;
            const isActive = activeStep === id;
            const Icon = index === 0 ? Mic2 : index === 1 ? Waves : Music2;
            return (
              <article className={`vocal-step ${isActive ? "is-active" : ""}`} key={step.id}>
                <button
                  type="button"
                  className={`vocal-studio-card ${isComplete ? "is-complete" : ""}`}
                  aria-pressed={isComplete}
                  onClick={() => setCompleted((current) => isComplete ? current.filter((item) => item !== step.id) : [...current, step.id])}
                >
                  <span className="vocal-studio-icon">{isComplete ? <Check size={20} /> : <Icon size={20} />}</span>
                  <small>{String(index + 1).padStart(2, "0")} · {step.label}</small>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                  <span className="vocal-step-state">{isComplete ? <><Check size={13} /> Done</> : <><Circle size={13} /> Mark complete</>}</span>
                </button>
                <div className="vocal-step-live">
                  <button type="button" className="vocal-live-toggle" aria-pressed={isActive} onClick={() => selectStep(id)}>
                    {isActive ? "Hide from graph" : "Show on graph"}
                  </button>
                  {isActive && id === "sustain" && (
                    <div className="vocal-live-body">
                      <div className="vocal-ring" role="img" aria-label={`Steadiness ring for ${noteLabel(targetMidi)}`}>
                        <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true" focusable="false">
                          <circle cx="40" cy="40" r={RING_RADIUS} className="vocal-ring-track" />
                          <circle ref={ringRef} cx="40" cy="40" r={RING_RADIUS} className="vocal-ring-fill" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH} transform="rotate(-90 40 40)" />
                        </svg>
                        <b>{noteLabel(targetMidi)}</b>
                      </div>
                      <div className="vocal-live-text">
                        <span ref={sustainTextRef}>0.0 s in the band</span>
                        <small>{sustainReached ? `Held for ${SUSTAIN_FILL_MS / 1000} seconds. Sing on, or pick another note.` : `The ring fills over ${SUSTAIN_FILL_MS / 1000} seconds inside the band and eases back when you leave it.`}</small>
                      </div>
                      {noteSelect("vocal-sustain-note", "Target note", targetMidi, setSustainTarget)}
                      <div className="vocal-live-buttons">
                        {playReference && <button type="button" className="button secondary" onClick={() => playReference(targetMidi)}><Volume2 size={14} /> Hear note</button>}
                        {lockedChoice !== null && lockedChoice !== targetMidi && <button type="button" className="button secondary" onClick={() => setSustainTarget(lockedChoice)}><Target size={14} /> Use tuner lock ({noteLabel(lockedChoice)})</button>}
                      </div>
                      <small className="vocal-live-help">Band: ±{bandCents}&cent;. It follows the Precision setting in Tune, never narrower than ±{SUSTAIN_MIN_BAND_CENTS}&cent; because a voice moves more than an instrument does. This shows what you sang; it is not a mark.{playReference ? " Use headphones for the note if the microphone is on." : ""}</small>
                    </div>
                  )}
                  {isActive && id === "glide" && (
                    <div className="vocal-live-body">
                      <div className="vocal-live-fields">
                        {noteSelect("vocal-glide-from", "From", fromMidi, setGlideFrom)}
                        {noteSelect("vocal-glide-to", "To", toMidi, setGlideTo)}
                      </div>
                      <div className="vocal-live-buttons">
                        {glideRunningNow
                          ? <button type="button" className="button secondary" onClick={stopGlide}><Square size={14} /> Stop siren</button>
                          : <button type="button" className="button secondary" onClick={startGlide} disabled={fromMidi === toMidi}><Play size={14} /> Start siren</button>}
                      </div>
                      <small className="vocal-live-help">{notice || `A path rises from ${noteLabel(fromMidi)} to ${noteLabel(toMidi)} and back over ${GLIDE_DURATION_MS / 1000} seconds. Slide along it; your line is drawn over the path. It is a guide to look at, not a mark.`}</small>
                    </div>
                  )}
                  {isActive && id === "start" && (
                    <div className="vocal-live-body">
                      <div className="vocal-live-text">
                        <span>{onsetInfo.count === 0 ? "No starts marked yet" : `${onsetInfo.count} ${onsetInfo.count === 1 ? "start" : "starts"} marked`}</span>
                        {onsetInfo.label && <small>Latest start landed near {onsetInfo.label}</small>}
                      </div>
                      <div className="vocal-live-buttons">
                        <button type="button" className="button secondary" onClick={() => { overlayRef.current.onsets = []; setOnsetInfo({ count: 0, label: "" }); setRevision((value) => value + 1); }}><Eraser size={14} /> Clear marks</button>
                      </div>
                      <small className="vocal-live-help">A tick appears wherever a sound begins after about a third of a second of quiet. It marks when and at what pitch each start landed; it does not say whether the start was good.</small>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <footer className="vocal-routine-actions">
          <p aria-live="polite">{saved ? `Saved ${elapsedLabel} of Vocal practice on this device.` : !hasStarted ? "Start when you’re ready; the timer counts only while running." : `${completed.length} of ${ROUTINE_STEPS.length} steps marked complete.`}</p>
          <div>
            {saved ? <button className="button secondary" onClick={resetRoutine}><RotateCcw size={15} /> New warm-up</button> : <>
              <button className="button secondary" onClick={() => { setSaved(false); setHasStarted(true); setRunning((value) => !value); }}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause" : hasStarted ? "Resume" : "Start warm-up"}</button>
              {hasStarted && !running && <button className="button primary" onClick={finishRoutine} disabled={elapsedSeconds === 0}>Finish & save</button>}
            </>}
          </div>
        </footer>
      </section>

      {/* V-C: play-along */}

      <p className="local-note"><Crosshair size={13} /> The practice log, recorded range and tuner history stay on this device. Pitch feedback supports listening; it is not a vocal-health measure.</p>
    </div>
  );
}
