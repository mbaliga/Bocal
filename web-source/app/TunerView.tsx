"use client";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleDot,
  Crosshair,
  Eraser,
  Guitar,
  LockKeyhole,
  Mic,
  Rotate3D,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Volume2,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { ToneGenerator } from "./ToneGenerator";
import {
  DAMPING_HINTS,
  DAMPING_LABELS,
  DAMPING_ORDER,
  DAMPING_PRESETS,
  SENSITIVITY_HINTS,
  SENSITIVITY_LABELS,
  SENSITIVITY_ORDER,
  SENSITIVITY_PRESETS,
  type Damping,
  type PitchTrackerReading,
  type Sensitivity,
} from "./pitch-engine";
import { PRECISION_TOLERANCE, type PitchReading } from "./useTuner";
import { hzToMidi } from "./music-math";
import { CORRECTION_COPY, type InstrumentProfile } from "./instruments";
import StaffNote from "./StaffNote";
import {
  fullNoteLabel,
  NOTATION_ORDER,
  NOTATION_SYSTEMS,
  noteName,
  octaveLabel,
  TONIC_CHOICES,
  type NotationSystem,
} from "./notation";
import {
  DEGREE_LABELS,
  REFERENCE_HZ_MAX,
  REFERENCE_HZ_MIN,
  REFERENCE_HZ_STEP,
  TEMPERAMENT_ORDER,
  TEMPERAMENT_PROFILES,
  TEMPERAMENTS,
  type TemperamentId,
} from "./tuning";
import "./styles/tuner.css";

const REFERENCE_PRESETS: { hz: number; label: string }[] = [
  { hz: 415, label: "Baroque" },
  { hz: 430, label: "Classical" },
  { hz: 440, label: "Standard" },
  { hz: 442, label: "" },
  { hz: 443, label: "" },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

/**
 * Copy for the tuner's lab launch card. This used to be hardcoded to
 * "alto sax or bust, else it must be the oboe" -- which was already wrong
 * for a soprano/tenor/bari player, and would have stayed wrong for the new
 * chart-only instruments too. Driven off `labTier` instead, so every
 * instrument's card says what its lab actually is.
 */
function labCardCopy(instrument: InstrumentProfile, writtenLabel: string | null) {
  const name = instrument.shortName.toLowerCase();
  if (instrument.labTier === "fingering") {
    return {
      kicker: "Fingering lab",
      heading: writtenLabel ? `See ${writtenLabel} on the sax.` : `Open the interactive ${name} lab.`,
      body: "Open the sax and the keys for this note will light up.",
    };
  }
  if (instrument.labTier === "anatomy") {
    return {
      kicker: "Anatomy + chart",
      heading: `Explore the ${name} up close.`,
      body: "Turn the 3D model, or jump straight to the fingering chart below it.",
    };
  }
  if (instrument.labTier === "chart") {
    return {
      kicker: "Fingering chart",
      heading: writtenLabel ? `See ${writtenLabel} on the chart.` : `Open the ${name} fingering chart.`,
      body: "Pick a written note and see exactly which keys to press.",
    };
  }
  return { kicker: "Lab", heading: `Open the ${name} tools.`, body: "Tuner and practice tools are ready for this instrument." };
}

// Memoized: this and CalibrationPicker/TunerView below used to re-render on
// every ~30ms tuner sample tick along with the rest of the page (tuner.md
// finding "Every 30 ms sample tick re-renders the whole page"). With the
// publish-rate throttle in useTuner and these three components wrapped, an
// unchanged prop set now bails out instead of re-rendering their DOM.
const NotationPicker = memo(function NotationPicker({
  notation,
  saTonic,
  onNotationChange,
  onSaTonicChange,
}: {
  notation: NotationSystem;
  saTonic: number;
  onNotationChange: (next: NotationSystem) => void;
  onSaTonicChange: (next: number) => void;
}) {
  const profile = NOTATION_SYSTEMS[notation];
  return (
    <div className="notation-picker">
      <div className="notation-switch" role="radiogroup" aria-label="Note naming system">
        {NOTATION_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={notation === id}
            className={notation === id ? "is-active" : ""}
            onClick={() => onNotationChange(id)}
          >
            {NOTATION_SYSTEMS[id].label}
          </button>
        ))}
      </div>
      <p className="notation-hint">{profile.description}</p>
      {profile.needsTonic && (
        <label className="notation-tonic">
          {/* "(written)" qualifies which pitch space this picks Sa from: the
              readout above shows written pitch first, and this picker feeds
              that same written note name, not the concert one the temperament
              key-centre picker below uses (tuner.md finding "Key centre and
              Sa is use the same letter picker but one is concert pitch and
              the other written pitch, and neither says so"). */}
          <span>Sa is (written)</span>
          <select value={saTonic} onChange={(event) => onSaTonicChange(Number(event.target.value))}>
            {TONIC_CHOICES.map((choice) => (
              <option key={choice.pc} value={choice.pc}>
                {choice.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
});

// Calibration is set-once-then-forget, unlike the notation switch a player
// might flip between mid-session, so it lives behind a disclosure instead of
// sitting open in the readout. Same crater/keycap vocabulary as
// NotationPicker above -- recessed track for what you choose from, raised
// keycap for what you chose.
const CalibrationPicker = memo(function CalibrationPicker({
  referenceHz,
  temperament,
  temperamentKeyPc,
  onReferenceHzChange,
  onTemperamentChange,
  onTemperamentKeyPcChange,
  customCents,
  onCustomCentChange,
  sensitivity,
  onSensitivityChange,
  damping,
  onDampingChange,
  writtenOffset,
  keyCentreMode,
  onKeyCentreModeChange,
  displayMode,
  onDisplayModeChange,
}: {
  referenceHz: number;
  temperament: TemperamentId;
  temperamentKeyPc: number;
  onReferenceHzChange: (next: number) => void;
  onTemperamentChange: (next: TemperamentId) => void;
  onTemperamentKeyPcChange: (next: number) => void;
  customCents: number[];
  onCustomCentChange: (degreeIndex: number, value: number) => void;
  sensitivity: Sensitivity;
  onSensitivityChange: (next: Sensitivity) => void;
  damping: Damping;
  onDampingChange: (next: Damping) => void;
  /** Semitones from concert to written pitch for the current instrument. */
  writtenOffset: number;
  keyCentreMode: "concert" | "written";
  onKeyCentreModeChange: (next: "concert" | "written") => void;
  displayMode: "written" | "concert";
  onDisplayModeChange: (next: "written" | "concert") => void;
}) {
  const [open, setOpen] = useState(false);
  const profile = TEMPERAMENT_PROFILES[temperament];
  const hzLabel = Number.isInteger(referenceHz) ? String(referenceHz) : referenceHz.toFixed(1);
  // The key centre a temperament is built around is always a *concert*
  // pitch class in tuning.ts (readingFor/targetHzFor need it that way), but
  // a transposing player thinks in their written key -- an alto player who
  // wants "Key centre: C" to mean their written C (concert Eb) needs the
  // toggle below to convert through writtenOffset before it's stored
  // (tuner.md finding "Key centre and Sa is use the same letter picker but
  // one is concert pitch and the other written pitch").
  const pc = (value: number) => ((value % 12) + 12) % 12;
  const displayedKeyPc = keyCentreMode === "written" ? pc(temperamentKeyPc + writtenOffset) : temperamentKeyPc;
  const handleKeyPcChange = (nextDisplayedPc: number) => {
    onTemperamentKeyPcChange(keyCentreMode === "written" ? pc(nextDisplayedPc - writtenOffset) : nextDisplayedPc);
  };
  // Per-cell string drafts so a partially-typed "-" (or "-5") isn't clobbered
  // back to "0" on every keystroke -- a plain controlled `<input
  // type="number">` reads a bare "-" as `Number("") === 0`, snapping the
  // field back and eating the minus sign before a player can finish typing a
  // negative offset, which is most of them (tuner.md finding "Custom
  // temperament fields cannot accept a negative number").
  const [customDrafts, setCustomDrafts] = useState<string[]>(() => customCents.map((value) => String(value)));
  // Resyncs drafts from the prop when it changes for a reason other than
  // this component's own edits (e.g. "Load from current pressed", or the
  // instrument changed) -- done as a render-time state adjustment (React's
  // documented pattern for "adjusting state when a prop changes") rather
  // than a `useEffect` that calls setState, which the lint rule
  // react-hooks/set-state-in-effect flags as an avoidable extra render.
  const [syncedCustomCents, setSyncedCustomCents] = useState(customCents);
  if (syncedCustomCents !== customCents) {
    setSyncedCustomCents(customCents);
    setCustomDrafts(customCents.map((value) => String(value)));
  }
  const commitCustomDraft = (index: number, draft: string) => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) onCustomCentChange(index, parsed);
    else setCustomDrafts((current) => { const next = current.slice(); next[index] = String(customCents[index] ?? 0); return next; });
  };
  // Remembers the last non-"custom" temperament the player had selected, so
  // "Load from current" (only shown once Custom is active) has something
  // other than Custom's own table to copy from -- it seeds the custom grid
  // from whichever named temperament the player was just looking at. Uses
  // state updated during render (React's documented pattern) rather than a
  // ref written during render, which react-hooks/refs flags.
  const [lastNamedTemperament, setLastNamedTemperament] = useState<Exclude<TemperamentId, "custom">>(
    temperament === "custom" ? "equal" : temperament,
  );
  const [syncedTemperament, setSyncedTemperament] = useState(temperament);
  if (syncedTemperament !== temperament) {
    setSyncedTemperament(temperament);
    if (temperament !== "custom") setLastNamedTemperament(temperament);
  }
  const loadFromCurrentTemperament = () => {
    TEMPERAMENTS[lastNamedTemperament].forEach((value, index) => onCustomCentChange(index, value));
  };
  return (
    <div className="calibration-picker">
      <button
        type="button"
        className="calibration-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={13} />
        <span>Calibration</span>
        <span className="calibration-summary">{hzLabel} Hz · {profile.label}</span>
        <ChevronDown size={14} className={open ? "is-open" : ""} />
      </button>
      {open && (
        <div className="calibration-body">
          <div className="calibration-row">
            <div className="calibration-row-head">
              <label htmlFor="calibration-reference-hz">Reference pitch (A4)</label>
              <span className="calibration-value">{hzLabel} Hz</span>
            </div>
            <input
              id="calibration-reference-hz"
              type="range"
              min={REFERENCE_HZ_MIN}
              max={REFERENCE_HZ_MAX}
              step={REFERENCE_HZ_STEP}
              value={referenceHz}
              onChange={(event) => onReferenceHzChange(Number(event.target.value))}
            />
            <div className="calibration-presets" role="group" aria-label="Reference pitch presets">
              {REFERENCE_PRESETS.map((preset) => (
                <button
                  key={preset.hz}
                  type="button"
                  className={referenceHz === preset.hz ? "is-active" : ""}
                  onClick={() => onReferenceHzChange(preset.hz)}
                >
                  {preset.hz}
                  {preset.label && <small>{preset.label}</small>}
                </button>
              ))}
            </div>
          </div>

          <div className="calibration-row">
            <div className="calibration-row-head">
              <label htmlFor="calibration-temperament">Temperament</label>
            </div>
            {/* A crater/keycap switch like NotationPicker's works for four
                choices; it doesn't for the eleven a Tunable-depth temperament
                list needs at 412px, so this one is a plain select styled to
                match the same recessed-track language instead. */}
            <select
              id="calibration-temperament"
              className="calibration-select"
              value={temperament}
              onChange={(event) => onTemperamentChange(event.target.value as TemperamentId)}
            >
              {TEMPERAMENT_ORDER.map((id) => (
                <option key={id} value={id}>
                  {TEMPERAMENT_PROFILES[id].label}
                </option>
              ))}
            </select>
            <p className="notation-hint">{profile.description}</p>
            {profile.needsKeyCentre && (
              <>
                <label className="notation-tonic">
                  {/* "(concert)" qualifies which pitch space this centres the
                      temperament on -- readingFor treats it as a concert
                      pitch class regardless of the toggle below, so a
                      transposing player who wants their own written key
                      needs the Written/Concert switch to convert it first
                      (tuner.md finding on the ambiguous "Key centre"/"Sa is"
                      pickers). */}
                  <span>Key centre ({keyCentreMode})</span>
                  <select value={displayedKeyPc} onChange={(event) => handleKeyPcChange(Number(event.target.value))}>
                    {TONIC_CHOICES.map((choice) => (
                      <option key={choice.pc} value={choice.pc}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </label>
                {writtenOffset !== 0 && (
                  <div className="notation-switch key-centre-mode" role="radiogroup" aria-label="Key centre pitch space">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={keyCentreMode === "written"}
                      className={keyCentreMode === "written" ? "is-active" : ""}
                      onClick={() => onKeyCentreModeChange("written")}
                    >
                      Written
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={keyCentreMode === "concert"}
                      className={keyCentreMode === "concert" ? "is-active" : ""}
                      onClick={() => onKeyCentreModeChange("concert")}
                    >
                      Concert
                    </button>
                  </div>
                )}
              </>
            )}
            {temperament === "custom" && (
              <>
                <button type="button" className="small-action load-from-current" onClick={loadFromCurrentTemperament}>
                  Load from {TEMPERAMENT_PROFILES[lastNamedTemperament].label}
                </button>
                <div className="custom-temperament-grid" role="group" aria-label="Custom temperament cent offsets">
                  {DEGREE_LABELS.map((label, index) => (
                    <label key={label} className="custom-temperament-cell">
                      <span>{label}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="-?[0-9]*\.?[0-9]*"
                        value={customDrafts[index] ?? "0"}
                        disabled={index === 0}
                        onChange={(event) => {
                          const next = event.target.value;
                          setCustomDrafts((current) => { const copy = current.slice(); copy[index] = next; return copy; });
                        }}
                        onBlur={(event) => commitCustomDraft(index, event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") commitCustomDraft(index, (event.target as HTMLInputElement).value); }}
                        aria-label={`${label} cents from equal`}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="calibration-row">
            <label>Sensitivity</label>
            <div className="notation-switch" role="radiogroup" aria-label="Tuner sensitivity">
              {SENSITIVITY_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={sensitivity === id}
                  className={sensitivity === id ? "is-active" : ""}
                  onClick={() => onSensitivityChange(id)}
                >
                  {SENSITIVITY_LABELS[id]}
                </button>
              ))}
            </div>
            <p className="notation-hint">{SENSITIVITY_HINTS[sensitivity]}</p>
          </div>

          <div className="calibration-row">
            <label>Damping</label>
            <div className="notation-switch" role="radiogroup" aria-label="Tuner damping">
              {DAMPING_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={damping === id}
                  className={damping === id ? "is-active" : ""}
                  onClick={() => onDampingChange(id)}
                >
                  {DAMPING_LABELS[id]}
                </button>
              ))}
            </div>
            <p className="notation-hint">{DAMPING_HINTS[damping]}</p>
          </div>

          {writtenOffset !== 0 && (
            <div className="calibration-row">
              <label>Readout</label>
              <div className="notation-switch" role="radiogroup" aria-label="Readout pitch space">
                <button
                  type="button"
                  role="radio"
                  aria-checked={displayMode === "written"}
                  className={displayMode === "written" ? "is-active" : ""}
                  onClick={() => onDisplayModeChange("written")}
                >
                  Written
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={displayMode === "concert"}
                  className={displayMode === "concert" ? "is-active" : ""}
                  onClick={() => onDisplayModeChange("concert")}
                >
                  Concert
                </button>
              </div>
              <p className="notation-hint">
                {displayMode === "written"
                  ? "The note name, staff and history graph show your written pitch -- what you read off the page."
                  : "The note name, staff and history graph show concert pitch -- what the note actually sounds as."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const TunerView = memo(function TunerView({
  reading,
  listening,
  trackerReading,
  pitchTrace,
  acceptedFrames,
  sessionSeconds,
  micMessage,
  onListen,
  onReference,
  onOpenSax,
  instrument,
  notation,
  saTonic,
  onNotationChange,
  onSaTonicChange,
  referenceHz,
  temperament,
  temperamentKeyPc,
  onReferenceHzChange,
  onTemperamentChange,
  onTemperamentKeyPcChange,
  customCents,
  onCustomCentChange,
  sensitivity,
  onSensitivityChange,
  damping,
  onDampingChange,
  precision,
  onPrecisionChange,
  historyMode,
  onHistoryModeChange,
  onClearHistory,
  historyCanvasRef,
  keyCentreMode,
  onKeyCentreModeChange,
  lockedTargetMidi,
  onLockTarget,
  displayMode,
  onDisplayModeChange,
  onPlayPitchPipe,
  onStopPitchPipe,
  onOpenKeyboardHelp,
}: {
  reading: PitchReading | null;
  listening: boolean;
  trackerReading: PitchTrackerReading;
  pitchTrace: number[];
  acceptedFrames: number;
  sessionSeconds: number;
  micMessage: string;
  onListen: () => void;
  onReference: () => void;
  onOpenSax: () => void;
  instrument: InstrumentProfile;
  notation: NotationSystem;
  saTonic: number;
  onNotationChange: (next: NotationSystem) => void;
  onSaTonicChange: (next: number) => void;
  referenceHz: number;
  temperament: TemperamentId;
  temperamentKeyPc: number;
  onReferenceHzChange: (next: number) => void;
  onTemperamentChange: (next: TemperamentId) => void;
  onTemperamentKeyPcChange: (next: number) => void;
  customCents: number[];
  onCustomCentChange: (degreeIndex: number, value: number) => void;
  sensitivity: Sensitivity;
  onSensitivityChange: (next: Sensitivity) => void;
  damping: Damping;
  onDampingChange: (next: Damping) => void;
  precision: "standard" | "fine" | "ultra";
  onPrecisionChange: (next: "standard" | "fine" | "ultra") => void;
  historyMode: "line" | "staff";
  onHistoryModeChange: (next: "line" | "staff") => void;
  onClearHistory: () => void;
  historyCanvasRef: (node: HTMLCanvasElement | null) => void;
  keyCentreMode: "concert" | "written";
  onKeyCentreModeChange: (next: "concert" | "written") => void;
  /** Concert MIDI of the manually locked target note, or null when unlocked. */
  lockedTargetMidi: number | null;
  onLockTarget: (midi: number | null) => void;
  /** Which pitch space the primary readout, staff and history graph show. */
  displayMode: "written" | "concert";
  onDisplayModeChange: (next: "written" | "concert") => void;
  /** Pitch pipe: plays `midi` (concert) through the calibrated reference-tone path until stopped. */
  onPlayPitchPipe: (midi: number) => void;
  onStopPitchPipe: () => void;
  onOpenKeyboardHelp: () => void;
}) {
  const tolerance = PRECISION_TOLERANCE[precision];
  const inTune = trackerReading.state === "locked" && reading !== null && Math.abs(reading.cents) <= tolerance;
  const direction = reading === null ? "Waiting" : reading.cents > tolerance ? "Sharp" : reading.cents < -tolerance ? "Flat" : "Centered";
  const markerPosition = reading === null ? 50 : Math.max(4, Math.min(96, 50 + reading.cents * 0.8));
  // The concert name is always shown in letters. It exists so a player can
  // check themselves against a piano or another section, and that conversation
  // happens in letter names whatever the player reads from.
  const concertNote = reading === null ? null : fullNoteLabel(reading.concertMidi, "western");
  const writtenLabel = reading === null ? null : fullNoteLabel(reading.writtenMidi, notation, saTonic);
  // Manual target-note lock (TonalEnergy "Target", Tunable's note lock).
  // Tapping the note name locks/releases the *currently shown* note; the
  // "pick any note" select is the secondary control for locking to a note
  // that isn't sounding yet. Both write concert MIDI -- pitch-engine.ts's
  // StablePitchTracker only knows raw (concert) pitch.
  const isTargetLocked = lockedTargetMidi !== null;
  const toggleTargetLock = () => {
    if (isTargetLocked) onLockTarget(null);
    else if (reading) onLockTarget(reading.concertMidi);
  };
  const lockedTargetLabel = isTargetLocked ? fullNoteLabel(lockedTargetMidi, "western") : null;
  // Written/concert readout toggle (Calibration): both midi values are the
  // same physical pitch, so only which one is *displayed* changes here --
  // cents (the deviation) is identical either way.
  const displayMidi = reading === null ? null : displayMode === "concert" ? reading.concertMidi : reading.writtenMidi;
  const displayLabel = reading === null ? null : fullNoteLabel(displayMidi!, notation, saTonic);
  // Pitch pipe: whichever note the readout is currently framing as "the
  // target" -- the locked target if there is one (works even in silence),
  // else the concert pitch of the note currently showing.
  const pitchPipeMidi = lockedTargetMidi ?? reading?.concertMidi ?? null;
  const [isPitchPiping, setIsPitchPiping] = useState(false);
  const startPipe = () => {
    if (pitchPipeMidi === null) return;
    setIsPitchPiping(true);
    onPlayPitchPipe(pitchPipeMidi);
  };
  const stopPipe = () => {
    if (!isPitchPiping) return;
    setIsPitchPiping(false);
    onStopPitchPipe();
  };
  const targetNoteChoices = useMemo(() => {
    const low = Math.ceil(hzToMidi(instrument.range.minHz));
    const high = Math.floor(hzToMidi(instrument.range.maxHz));
    const choices: { midi: number; label: string }[] = [];
    for (let midi = low; midi <= high; midi += 1) choices.push({ midi, label: fullNoteLabel(midi, "western") });
    return choices;
  }, [instrument.range.minHz, instrument.range.maxHz]);
  const trackerLabel = !listening ? "Ready" : {
    calibrating: "Calibrating room",
    silence: "No clear tone",
    acquiring: "Finding note",
    locked: "Pitch locked",
    holding: "Holding lock",
  }[trackerReading.state];
  const centerInstruction = !listening
    ? "Start the tuner"
    : trackerReading.state === "calibrating"
      ? "Learning the room level"
      : trackerReading.state === "silence"
        ? "Play one steady note"
        : trackerReading.state === "acquiring"
          ? "Hold it steady"
          : trackerReading.state === "holding"
            ? "Brief signal dropout"
            : inTune
              ? "Tone locked"
              : direction === "Sharp"
                ? "Relax the pitch"
                : "Support the air";
  const insight = !listening
    ? { title: "Play one steady note.", copy: "The display stays blank until Bocal hears a clear pitch." }
    : trackerReading.state === "calibrating"
      ? { title: "Give it a second.", copy: "Bocal is checking the room’s noise level before it starts tuning." }
      : trackerReading.state === "silence"
        ? { title: "No clear note yet.", copy: "Play a sustained note near the phone. Background sound won’t be shown as a pitch." }
        : trackerReading.state === "acquiring"
          ? {
              title: "Keep holding it.",
              // Interpolates the live Sensitivity preset's frame count
              // instead of a hard-coded "three" -- the lock-policy line
              // just below already shows the real number, and the fixed
              // "three" here was wrong for every preset but Medium
              // (product.md finding "Tuner coaching copy contradicts the
              // engine").
              copy: `Bocal waits for ${SENSITIVITY_PRESETS[sensitivity].acquireFrames} consistent readings before it changes the displayed note.`,
            }
          : trackerReading.state === "holding"
            ? { title: "The signal dipped.", copy: "Bocal holds the last note briefly instead of jumping. The display clears if the sound doesn’t return." }
            : inTune
              ? { title: "Right in the middle.", copy: `You’re within ${tolerance} cents. Keep your embouchure and air where they are.` }
              : {
                  title: `${direction} by ${Math.abs(reading?.cents ?? 0)} cents.`,
                  // Per-family correction copy (reed / air-reed / double-reed
                  // / string) instead of one fixed "jaw pressure" / "biting"
                  // pair shown to every instrument including guitar strings
                  // and flute's air column, neither of which has a reed or a
                  // jaw to speak of (product.md finding "Tuner coaching copy
                  // contradicts the engine and the instrument").
                  copy: direction === "Sharp" ? CORRECTION_COPY[instrument.embouchure].sharp : CORRECTION_COPY[instrument.embouchure].flat,
                };
  const signalPercent = Math.min(100, Math.round((trackerReading.rms / Math.max(trackerReading.gate * 1.6, 0.0001)) * 100));

  return (
    <div className="content-wrap tuner-layout">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Tune · {instrument.name}</p>
          <h1>Find the center.</h1>
          <p>{instrument.tunerDescription}</p>
        </div>
        <div className="live-badge"><span className={trackerReading.state === "locked" ? "pulse-dot" : "quiet-dot"} /> {trackerLabel}</div>
      </section>

      <div className="tuner-grid">
        {/* aria-live used to sit on this whole section, which also holds 11
            interactive controls (precision select, notation radios,
            calibration disclosure, Line/Staff, Clear, Start/Stop) -- any of
            them changing, or the note readout ticking at up to 15Hz, queued
            the entire card's ~560 characters for announcement, and toggling
            a control inside a live region re-announces the region
            (a11y-ux.md finding "The entire tuner card is an aria-live
            region"). Moved to a small, visually-hidden status line below
            instead, which only the note/cents/state feed. */}
        <section className={`tuner-card ${inTune ? "is-centered" : ""} ${reading ? "has-reading" : "is-waiting"}`}>
          {/* Inline-styled rather than a `.visually-hidden` class: WP6 owns
              globals.css in this wave and a11y-ux.md separately flags that
              class as undefined today, so relying on it here would show
              this status line as visible text until that fix lands. */}
          <p
            aria-live="polite"
            aria-atomic="true"
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
          >
            {reading
              ? `${displayLabel}, ${Math.abs(Math.round(reading.cents))} cents ${reading.cents === 0 ? "in tune" : reading.cents > 0 ? "sharp" : "flat"}`
              : trackerLabel}
          </p>
          <div className="tuner-card-top">
            <span className="status-label"><CircleDot size={15} /> {trackerReading.state === "locked" ? direction : trackerLabel}</span>
            <div className="tuner-top-actions"><label className="precision-picker"><span>Precision</span><select value={precision} onChange={(event) => onPrecisionChange(event.target.value as "standard" | "fine" | "ultra")} aria-label="Tuner precision"><option value="standard">Standard ±10¢</option><option value="fine">Fine ±5¢</option><option value="ultra">Ultra ±2¢</option></select></label><button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear reference A</button><button className="small-action" aria-keyshortcuts="?" onClick={onOpenKeyboardHelp}>Keyboard</button></div>
          </div>

          <div className="note-readout">
            <button
              type="button"
              className={`note-readout-tap ${isTargetLocked ? "is-target-locked" : ""} ${isPitchPiping ? "is-piping" : ""}`}
              onClick={toggleTargetLock}
              onPointerDown={startPipe}
              onPointerUp={stopPipe}
              onPointerLeave={stopPipe}
              onPointerCancel={stopPipe}
              disabled={!isTargetLocked && !reading}
              aria-pressed={isTargetLocked}
              aria-label={
                isTargetLocked
                  ? `Release the locked target, ${lockedTargetLabel}. Press and hold to hear it.`
                  : reading
                    ? `Lock the target to ${displayLabel}. Press and hold to hear it.`
                    : "Play a note to lock a target"
              }
              title={isTargetLocked ? "Tap to release the target, press and hold to hear it" : "Tap to lock the target to this note, press and hold to hear it"}
            >
              {notation === "staff" ? (
                <StaffNote
                  midi={displayMidi}
                  clef={instrument.clef}
                  title={reading ? `${displayMode === "concert" ? "Concert" : "Written"} ${fullNoteLabel(displayMidi!, "western")}` : "No note detected yet"}
                />
              ) : (
                <div className={`note-name ${reading ? "" : "is-empty"}`}>
                  {reading ? (
                    <>
                      {noteName(displayMidi!, notation, saTonic)}
                      <sup>{octaveLabel(displayMidi!, notation, saTonic)}</sup>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              )}
            </button>
            <div className="pitch-detail">
              <span>{reading ? `${reading.cents > 0 ? "+" : ""}${reading.cents} cents` : "Waiting for a stable tone"}</span>
              <small>{reading ? `${reading.hz.toFixed(1)} Hz · sounds ${concertNote}` : "No note is shown until confidence passes the lock threshold"}</small>
            </div>
            {pitchPipeMidi !== null && <p className="pitch-pipe-hint">Press and hold to hear it</p>}
            <div className="target-lock-row">
              {isTargetLocked && (
                <button type="button" className="target-lock-badge" onClick={() => onLockTarget(null)}>
                  <LockKeyhole size={12} /> Locked to {lockedTargetLabel} <span aria-hidden="true">✕</span>
                </button>
              )}
              <label className="target-lock-picker">
                <span>Target</span>
                <select
                  value={lockedTargetMidi ?? ""}
                  onChange={(event) => onLockTarget(event.target.value === "" ? null : Number(event.target.value))}
                  aria-label="Lock the tuner to any note"
                >
                  <option value="">Off</option>
                  {targetNoteChoices.map((choice) => (
                    <option key={choice.midi} value={choice.midi}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <NotationPicker
            notation={notation}
            saTonic={saTonic}
            onNotationChange={onNotationChange}
            onSaTonicChange={onSaTonicChange}
          />

          <CalibrationPicker
            referenceHz={referenceHz}
            temperament={temperament}
            temperamentKeyPc={temperamentKeyPc}
            onReferenceHzChange={onReferenceHzChange}
            onTemperamentChange={onTemperamentChange}
            onTemperamentKeyPcChange={onTemperamentKeyPcChange}
            customCents={customCents}
            onCustomCentChange={onCustomCentChange}
            sensitivity={sensitivity}
            onSensitivityChange={onSensitivityChange}
            damping={damping}
            onDampingChange={onDampingChange}
            writtenOffset={instrument.writtenOffset}
            keyCentreMode={keyCentreMode}
            onKeyCentreModeChange={onKeyCentreModeChange}
            displayMode={displayMode}
            onDisplayModeChange={onDisplayModeChange}
          />

          <div
            className="tune-scale"
            role="meter"
            aria-valuemin={-50}
            aria-valuemax={50}
            aria-valuenow={reading ? Math.round(reading.cents) : 0}
            aria-valuetext={reading ? `${Math.abs(Math.round(reading.cents))} cents ${reading.cents < 0 ? "flat" : reading.cents > 0 ? "sharp" : "in tune"}` : "No reading"}
            aria-label="Pitch deviation in cents"
          >
            <div className="scale-labels"><span>−50</span><span>−25</span><strong>0</strong><span>+25</span><span>+50</span></div>
            <div className="scale-track">
              <span className="center-zone" />
              <span className="scale-center" />
              {reading && <span className="pitch-marker" style={{ left: `${markerPosition}%` }}><i /></span>}
            </div>
            <div className="direction-row"><span>Flatten ↓</span><strong>{inTune && <Check size={15} />}{centerInstruction}</strong><span>Sharpen ↑</span></div>
          </div>

          <section className="pitch-history" aria-label="Pitch history">
            <div className="pitch-history-head">
              <span className="pitch-history-title">Pitch history</span>
              <div className="pitch-history-controls">
                <div className="notation-switch pitch-history-mode" role="radiogroup" aria-label="History display">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={historyMode === "line"}
                    className={historyMode === "line" ? "is-active" : ""}
                    onClick={() => onHistoryModeChange("line")}
                  >
                    Line
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={historyMode === "staff"}
                    className={historyMode === "staff" ? "is-active" : ""}
                    onClick={() => onHistoryModeChange("staff")}
                  >
                    Staff
                  </button>
                </div>
                <button type="button" className="pitch-history-clear" onClick={onClearHistory}>
                  <Eraser size={13} /> Clear
                </button>
              </div>
            </div>
            <canvas
              ref={historyCanvasRef}
              className="pitch-history-canvas"
              role="img"
              aria-label="Cents deviation from the tuning target over the last ten seconds"
              height={104}
            />
            <p className="pitch-history-caption">
              {historyMode === "staff"
                ? "Notes you've held over the last 10 seconds, coloured by how close to target they were. Stops when the tuner does, so you can look back."
                : "Cents from target over the last 10 seconds — a flat line near the middle means you’re steady. Stops when the tuner does, so you can look back."}
            </p>
          </section>

          <div className="tracker-diagnostics" aria-label="Pitch lock diagnostics">
            <div><span>Input</span><i><b style={{ width: `${signalPercent}%` }} /></i><small>{signalPercent >= 63 ? "Above gate" : "Below gate"}</small></div>
            <div><span>Confidence</span><strong>{trackerReading.confidence > 0 ? `${Math.round(trackerReading.confidence * 100)}%` : "—"}</strong></div>
            <div><span>Accepted</span><strong>{acceptedFrames}</strong></div>
          </div>

          <button className={`listen-button ${listening ? "is-live" : ""}`} onClick={onListen}>
            {listening ? <AudioLines size={20} /> : <Mic size={20} />}
            {listening ? "Stop listening" : "Start live tuner"}
          </button>
          {micMessage && <p className="error-copy">{micMessage}</p>}
          <p className="local-note"><LockKeyhole size={13} /> Audio is analyzed here and never uploaded.</p>
        </section>

        <aside className="side-stack">
          <article className="insight-card">
            <div className="card-kicker"><Sparkles size={15} /> What the tuner hears</div>
            <h2>{insight.title}</h2>
            <p>{insight.copy}</p>
            <div className="mini-bars" aria-label="Accepted pitch-frame stability">
              {Array.from({ length: 18 }, (_, index) => pitchTrace[index] ?? null).map((cents, index) => (
                <i key={index} className={cents === null ? "is-empty" : ""} style={{ height: cents === null ? "8%" : `${Math.max(12, 100 - Math.abs(cents) * 1.75)}%` }} />
              ))}
            </div>
            <p className="lock-policy">
              <LockKeyhole size={13} /> Noise gate · {SENSITIVITY_PRESETS[sensitivity].acquireFrames}-frame lock · {DAMPING_PRESETS[damping].holdMs} ms dropout hold
            </p>
          </article>

          {instrument.id === "guitar" ? (
            <article className="guitar-launch-card" onClick={onOpenSax} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenSax()}>
              <span className="card-kicker"><Guitar size={15} /> String studio</span>
              <h3>{reading ? `Put ${writtenLabel} in context.` : "Tune, then follow the chord shapes."}</h3>
              <p>Six-string tuning, colour-coded finger placement and a patient chord player.</p>
              <div className="guitar-launch-strings" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <span className="round-arrow"><ArrowRight size={17} /></span>
            </article>
          ) : (() => {
            const lab = labCardCopy(instrument, writtenLabel);
            return (
              <article className="sax-card" onClick={onOpenSax} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenSax()}>
                <div>
                  <span className="card-kicker"><Rotate3D size={15} /> {lab.kicker}</span>
                  <h3>{lab.heading}</h3>
                  <p>{lab.body}</p>
                </div>
                <div className={`sax-card-photo ${instrument.labTier === "anatomy" ? "is-oboe" : ""}`} aria-hidden="true" />
                <span className="round-arrow"><ArrowRight size={17} /></span>
              </article>
            );
          })()}
        </aside>
      </div>

      <ToneGenerator
        referenceHz={referenceHz}
        temperament={temperament}
        temperamentKeyPc={temperamentKeyPc}
        notation={notation}
        saTonic={saTonic}
        customCents={customCents}
        followMidi={trackerReading.state === "locked" ? reading?.concertMidi ?? null : null}
        displayMode={displayMode}
        writtenOffset={instrument.writtenOffset}
      />

      <section className="today-strip">
        <div className="today-title"><span>This session</span><strong>Your practice, as it happens.</strong></div>
        <Metric value={formatTime(sessionSeconds)} label="Practice timer" detail={sessionSeconds ? "current session" : "start when ready"} icon={TimerReset} />
        <Metric value={reading ? `±${Math.abs(reading.cents)}¢` : "—"} label="Pitch offset" detail={trackerReading.state === "locked" ? "accepted reading" : "awaiting lock"} icon={Crosshair} />
        <Metric value={`${acceptedFrames}`} label="Accepted frames" detail="this tuner run" icon={Activity} />
      </section>
    </div>
  );
});

function Metric({ value, label, detail, icon: Icon }: { value: string; label: string; detail: string; icon: typeof Activity }) {
  return (
    <div className="metric">
      <span className="metric-icon"><Icon size={17} /></span>
      <div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>
    </div>
  );
}
