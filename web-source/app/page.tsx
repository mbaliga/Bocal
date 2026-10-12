Warning: truncated output (original token count: 23609)
Total output lines: 2005

"use client";
import "./native-bridge";

import {
  Activity,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Crosshair,
  Download,
  Eraser,
  FileText,
  Guitar,
  LockKeyhole,
  Mic,
  Mic2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Rotate3D,
  SlidersHorizontal,
  Settings2,
  Smartphone,
  Sparkles,
  Sun,
  TimerReset,
  Volume2,
  Waves,
  Wind,
  X,
  Moon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisView } from "./AnalysisView";
import {
  BOCAL_ONBOARDING_KEY,
  InstrumentPickerExperience,
  OnboardingGuide,
} from "./InstrumentExperience";
import { GuitarStudio } from "./GuitarStudio";
import { VocalStudio } from "./VocalStudio";
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
  StablePitchTracker,
  type Damping,
  type PitchTrackerReading,
  type Sensitivity,
  type StablePitchTrackerOptions,
} from "./pitch-engine";
import { drawPitchHistory, readPitchHistoryTheme } from "./pitch-history-canvas";
import { PitchHistoryBuffer } from "./pitch-history";
import { CORRECTION_COPY, INSTRUMENTS, isInstrumentId, type InstrumentId, type InstrumentProfile } from "./instruments";
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
import { PracticeView, PulseView } from "./PracticeTools";
import {
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  summarizeTunerSession,
  withTunerSession,
} from "./skill-rating";
import {
  readingFor,
  targetHzFor,
  loadCustomTemperamentCents,
  serializeCustomTemperamentCents,
  CUSTOM_TEMPERAMENT_STORAGE_KEY,
  DEGREE_LABELS,
  REFERENCE_HZ_DEFAULT,
  REFERENCE_HZ_MAX,
  REFERENCE_HZ_MIN,
  REFERENCE_HZ_STEP,
  TEMPERAMENT_ORDER,
  TEMPERAMENT_PROFILES,
  TEMPERAMENTS,
  type TemperamentId,
  type TuningOptions,
} from "./tuning";
import { recordPracticeActivity } from "./practice-data";

// The Android WebView shell (WP7) exposes this bridge as `window.bocalHost`.
// Declared here so the web app can call it defensively ahead of that work
// landing -- every call is optional-chained, so nothing breaks in the
// browser preview or before the native side ships the interface.
const SaxophoneLab = dynamic(
  () => import("./SaxophoneLab").then((module) => module.SaxophoneLab),
  { ssr: false },
);

type Mode = "tune" | "sax" | "pulse" | "analyze" | "practice";
type RailSide = "left" | "right";
type Theme = "dark" | "light";

type PitchReading = {
  hz: number;
  /** The note as the player reads it, already transposed for the instrument. */
  writtenMidi: number;
  /** What the note actually sounds as, for anyone tuning against a piano. */
  concertMidi: number;
  cents: number;
};

const NAVIGATION_SIDE_STORAGE_KEY = "bocal-navigation-side";
const INSTRUMENT_STORAGE_KEY = "bocal-instrument";
const PARTNER_INSTRUMENT_STORAGE_KEY = "bocal-instrument-partner";
const NOTATION_STORAGE_KEY = "bocal-notation";
const TONIC_STORAGE_KEY = "bocal-sa-tonic";
const REFERENCE_HZ_STORAGE_KEY = "bocal-reference-hz";
const TEMPERAMENT_STORAGE_KEY = "bocal-temperament";
const TEMPERAMENT_KEY_STORAGE_KEY = "bocal-temperament-key";
const THEME_STORAGE_KEY = "bocal-theme";
const SENSITIVITY_STORAGE_KEY = "bocal-tuner-sensitivity";
const DAMPING_STORAGE_KEY = "bocal-tuner-damping";
const HISTORY_MODE_STORAGE_KEY = "bocal-tuner-history-mode";
const PRECISION_STORAGE_KEY = "bocal-tuner-precision";
const KEY_CENTRE_MODE_STORAGE_KEY = "bocal-temperament-key-mode";

// The pitch-history graph shows the trailing HISTORY_WINDOW_MS of readings.
// The ring buffer's capacity is sized off the sampling loop's own ~30ms
// cadence (see the `now - lastAnalysisAt >= 30` throttle in startListening
// below) with headroom for a slightly bursty rAF, not a separate constant
// someone could drift out of sync with the loop.
const HISTORY_WINDOW_MS = 10_000;
const HISTORY_CAPACITY = Math.ceil(HISTORY_WINDOW_MS / 30) + 30;

const PRECISION_TOLERANCE: Record<"standard" | "fine" | "ultra", number> = {
  standard: 10,
  fine: 5,
  ultra: 2,
};

const REFERENCE_PRESETS: { hz: number; label: string }[] = [
  { hz: 415, label: "Baroque" },
  { hz: 430, label: "Classical" },
  { hz: 440, label: "Standard" },
  { hz: 442, label: "" },
  { hz: 443, label: "" },
];

function pitchFromFrequency(hz: number, writtenOffset: number, tuning: TuningOptions): PitchReading {
  const { concertMidi, cents } = readingFor(hz, tuning);
  return {
    hz,
    writtenMidi: concertMidi + writtenOffset,
    concertMidi,
    cents,
  };
}

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
  if (instrument.labTier === "vocal") {
    return {
      kicker: "Vocal practice",
      heading: "Find the centre of your voice.",
      body: "Sing a comfortable sustained note, then open Vocal for pitch-first practice prompts.",
    };
  }
  return { kicker: "Lab", heading: `Open the ${name} tools.`, body: "Tuner and practice tools are ready for this instrument." };
}

const navItems: { id: Mode; label: string; icon: typeof Crosshair }[] = [
  { id: "tune", label: "Tune", icon: Crosshair },
  { id: "sax", label: "Lab", icon: Wind },
  { id: "pulse", label: "Pulse", icon: Waves },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "practice", label: "Practice", icon: Music2 },
];

/**
 * The "sax" nav item's label used to be a hard-coded "3D lab", shown for
 * every instrument including flute, clarinet, bassoon (chart-only -- the
 * chart lab's own header literally says "No 3D model exists yet") and
 * guitar (a 2D chord studio, not a lab at all) -- a11y-ux.md finding
 * "'3D lab' is the tab name for four instruments that have no 3D model".
 * Derived from `labTier` instead so the nav agrees with what's actually
 * behind the tab.
 */
function navLabelFor(itemId: Mode, instrument: InstrumentProfile): string {
  if (itemId !== "sax") return navItems.find((item) => item.id === itemId)?.label ?? "";
  if (instrument.labTier === "fingering" || instrument.labTier === "anatomy") return "Lab";
  if (instrument.labTier === "chart") return "Chart";
  if (instrument.labTier === "vocal") return "Vocal";
  return "Strings";
}

// Everything below derives from the one bar curve "M22 62 Q200 27 378 62"
// (viewBox 400×100; x linear in t, evenly spaced control x's). Seats at
// t = .07/.285/.5/.715/.93 — spread to fill the bar like the reference.
//
// ARC_SEATS: button centers, taken from the Bézier at each t — the row rides the curve.
// ARC_TILTS: the curve's tangent angle at each seat, so icons/labels lie along the arc.
const ARC_SEATS = [
  { left: "11.7%", top: "57.4%" },
  { left: "30.9%", top: "47.7%" },
  { left: "50.0%", top: "44.5%" },
  { left: "69.1%", top: "47.7%" },
  { left: "88.3%", top: "57.4%" },
];
const ARC_TILTS = ["-9.6deg", "-4.83deg", "0deg", "4.83deg", "9.6deg"];

// The instrument switch rides its own shallower arc so the dock reads as two
// stacked curves, as in the reference. Seats are computed at runtime rather
// than baked in like ARC_SEATS, because the instrument list grows as models
// clear licensing and expert review.
const PILL_VIEWBOX = { w: 200, h: 48 };
const PILL_PATH = "M16 32 Q100 16 184 32";
const PILL_POINTS: [number, number][] = [[16, 32], [100, 16], [184, 32]];

function pillSeat(index: number, count: number) {
  const t = (index + 0.5) / count;
  const [p0, p1, p2] = PILL_POINTS;
  const at = (a: number, b: number, c: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
  const slope = (a: number, b: number, c: number) => 2 * (1 - t) * (b - a) + 2 * t * (c - b);
  return {
    left: `${(at(p0[0], p1[0], p2[0]) / PILL_VIEWBOX.w) * 100}%`,
    top: `${(at(p0[1], p1[1], p2[1]) / PILL_VIEWBOX.h) * 100}%`,
    tilt: `${(Math.atan2(slope(p0[1], p1[1], p2[1]), slope(p0[0], p1[0], p2[0])) * 180) / Math.PI}deg`,
  };
}


export default function Home() {
  const [mode, setMode] = useState<Mode>("tune");
  const [instrumentId, setInstrumentId] = useState<InstrumentId>("alto-sax");
  const [partnerInstrumentId, setPartnerInstrumentId] = useState<InstrumentId>("oboe");
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [downloadCenterOpen, setDownloadCenterOpen] = useState(false);
  const [railSide, setRailSide] = useState<RailSide>("left");
  const [theme, setTheme] = useState<Theme>("dark");
  const [notation, setNotation] = useState<NotationSystem>("western");
  const [saTonic, setSaTonic] = useState(0);
  const [referenceHz, setReferenceHz] = useState(REFERENCE_HZ_DEFAULT);
  const [temperament, setTemperament] = useState<TemperamentId>("equal");
  const [temperamentKeyPc, setTemperamentKeyPc] = useState(0);
  const [customCents, setCustomCents] = useState<number[]>(() => loadCustomTemperamentCents(null));
  const [sensitivity, setSensitivity] = useState<Sensitivity>("medium");
  const [damping, setDamping] = useState<Damping>("normal");
  const [precision, setPrecision] = useState<"standard" | "fine" | "ultra">("fine");
  const [historyMode, setHistoryMode] = useState<"line" | "staff">("line");
  // Which pitch space the "Key centre" and "Sa is" pickers show/store their
  // pitch class in. tuning.ts's readingFor/targetHzFor always want a
  // *concert* pitch class (temperamentKeyPc keeps storing that, unchanged),
  // but a transposing player thinks in their own written key -- see
  // tuner.md's "Key centre and Sa is ... neither says so" finding.
  const [keyCentreMode, setKeyCentreMode] = useState<"concert" | "written">("concert");
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [trackerReading, setTrackerReading] = useState<PitchTrackerReading>({
    state: "silence",
    hz: null,
    rawHz: null,
    confidence: 0,
    rms: 0,
    gate: 0.009,
    accepted: false,
  });
  const [pitchTrace, setPitchTrace] = useState<number[]>([]);
  const [acceptedFrames, setAcceptedFrames] = useState(0);
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const instrument = INSTRUMENTS[instrumentId];
  // Sensitivity (acquireFrames/switchFrames/minimumConfidence), Damping
  // (holdMs/smoothing) and the instrument's frequency range are reapplied to
  // the running tracker via `configure()` rather than replacing the
  // instance, so switching any of them mid-session no longer drops an
  // active lock or restarts the 320ms room calibration (tuner.md finding
  // "Changing Sensitivity or Damping mid-session rebuilds the tracker").
  // `range` also fixes the tracker's biggest fidelity bug: it used to always
  // fall back to StablePitchTracker's own 120-1600 Hz defaults, so a
  // bassoon/bari/tenor low register read as silence and a flute A6-C7 read
  // an octave low (tuner.md finding 1).
  const trackerOptions = useMemo<StablePitchTrackerOptions>(() => {
    const sensitivityOptions = SENSITIVITY_PRESETS[sensitivity];
    const dampingOptions = DAMPING_PRESETS[damping];
    return { ...sensitivityOptions, ...dampingOptions, minHz: instrument.range.minHz, maxHz: instrument.range.maxHz };
  }, [sensitivity, damping, instrument.range.minHz, instrument.range.maxHz]);
  // Lazily constructed (rather than `useRef(new StablePitchTracker(...))`,
  // which builds and immediately discards an instance on every render --
  // ~33/s while listening, per tuner.md) and reconfigured in place below.
  const trackerRef = useRef<StablePitchTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new StablePitchTracker(trackerOptions);
  useEffect(() => {
    trackerRef.current?.configure(trackerOptions);
  }, [trackerOptions]);
  const tunerEvidenceRef = useRef<{ startedAt: number; cents: number[]; midiNotes: number[] } | null>(null);
  const tuningOptions = useMemo<TuningOptions>(
    () => ({ referenceHz, temperament, keyPc: temperamentKeyPc, customCents }),
    [referenceHz, temperament, temperamentKeyPc, customCents],
  );
  // Read from a ref inside the sampling loop below, rather than closing over
  // tuningOptions at the moment the loop started, so changing the reference
  // pitch or temperament mid-session takes effect on the very next frame
  // instead of only on the next "Start live tuner" press.
  const tuningOptionsRef = useRef(tuningOptions);
  useEffect(() => {
    tuningOptionsRef.current = tuningOptions;
  }, [tuningOptions]);
  // The pitch-history ring buffer lives in a ref, not React state, so pushing
  // a new sample every ~30ms during a session never triggers a re-render --
  // only the imperative canvas draw below reads it. historyCanvasRef is the
  // canvas TunerView renders; paintHistory draws directly onto it from the
  // rAF sampling loop the tuner already runs (see startListening), never
  // from a timer of its own.
  const pitchHistoryRef = useRef(new PitchHistoryBuffer(HISTORY_CAPACITY));
  const historyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyResizeObserverRef = useRef<ResizeObserver | null>(null);
  const paintHistory = useCallback(
    (fallbackNowMs: number) => {
      const canvas = historyCanvasRef.current;
      if (!canvas) return;
      const samples = pitchHistoryRef.current.toArray();
      const anchorMs = samples.length ? samples[samples.length - 1].tMs : fallbackNowMs;
      drawPitchHistory(canvas, pitchHistoryRef.current, {
        mode: historyMode,
        clef: instrument.clef,
        toleranceCents: PRECISION_TOLERANCE[precision],
        windowMs: HISTORY_WINDOW_MS,
        nowMs: anchorMs,
        theme: readPitchHistoryTheme(),
      });
    },
    [historyMode, instrument.clef, precision],
  );
  const paintHistoryRef = useRef(paintHistory);
  useEffect(() => {
    paintHistoryRef.current = paintHistory;
    // Repaint immediately on a mode/theme-relevant change even while not
    // listening, so toggling Line/Staff (or the app theme) on a frozen,
    // post-session graph updates it right away instead of waiting for the
    // next "Start live tuner" press. `theme` isn't a paintHistory dependency
    // itself (colours are re-read from the DOM on every call), it's only
    // here to trigger this one extra repaint when it flips.
    if (!listening) paintHistory(performance.now());
  }, [paintHistory, listening, theme]);
  const clearHistory = useCallback(() => {
    pitchHistoryRef.current.clear();
    paintHistoryRef.current(performance.now());
  }, []);
  // Callback ref (rather than a plain `useRef` attached via the `ref` prop)
  // so a repaint fires the moment the canvas actually mounts, not only when
  // one of paintHistory's dependencies happens to change. The canvas used to
  // go blank switching from Pulse back to Tune -- its backing store reset to
  // the untouched [300,104] default and stayed that way, because nothing in
  // the mount path called paintHistory (tuner.md finding "The frozen
  // pitch-history graph disappears after leaving and returning to Tune").
  // A ResizeObserver on the same node covers the other half of that finding
  // (rotating the phone on a frozen graph left it stretched until some other
  // event triggered a paint).
  const setHistoryCanvas = useCallback((node: HTMLCanvasElement | null) => {
    historyCanvasRef.current = node;
    historyResizeObserverRef.current?.disconnect();
    historyResizeObserverRef.current = null;
    if (!node) return;
    paintHistoryRef.current(performance.now());
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => paintHistoryRef.current(performance.now()));
      observer.observe(node);
      historyResizeObserverRef.current = observer;
    }
  }, []);
  useEffect(() => () => historyResizeObserverRef.current?.disconnect(), []);
  // Seated left to right along the pill arc, current instrument first.
  const pillInstruments = useMemo<InstrumentId[]>(
    () => (partnerInstrumentId === instrumentId ? [instrumentId] : [instrumentId, partnerInstrumentId]),
    [instrumentId, partnerInstrumentId],
  );

  useEffect(() => {
    let shouldOpen = true;
    try {
      shouldOpen = localStorage.getItem(BOCAL_ONBOARDING_KEY) !== "complete";
    } catch {
      shouldOpen = true;
    }
    const timer = window.setTimeout(() => setOnboardingOpen(shouldOpen), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        const next: Theme = saved === "light" || saved === "dark"
          ? saved
          : document.documentElement.dataset.theme === "light"
            ? "light"
            : "dark";
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.documentElement.style.colorScheme = next;
        window.bocalHost?.setTheme?.(next);
      } catch {
        // Dark remains the dependable default if browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(NAVIGATION_SIDE_STORAGE_KEY);
        if (saved === "left" || saved === "right") setRailSide(saved);
      } catch {
        // The navigation remains on the left when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(INSTRUMENT_STORAGE_KEY);
        if (isInstrumentId(saved)) setInstrumentId(saved);
        const savedPartner = localStorage.getItem(PARTNER_INSTRUMENT_STORAGE_KEY);
        if (isInstrumentId(savedPartner) && savedPartner !== saved) setPartnerInstrumentId(savedPartner);
        else if (saved === "oboe") setPartnerInstrumentId("alto-sax");
      } catch {
        // Bocal opens on the alto when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedNotation = localStorage.getItem(NOTATION_STORAGE_KEY);
        if (savedNotation && savedNotation in NOTATION_SYSTEMS) setNotation(savedNotation as NotationSystem);
        const savedTonic = Number(localStorage.getItem(TONIC_STORAGE_KEY));
        if (Number.isInteger(savedTonic) && savedTonic >= 0 && savedTonic < 12) setSaTonic(savedTonic);
      } catch {
        // Letter names are the fallback when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedHz = Number(localStorage.getItem(REFERENCE_HZ_STORAGE_KEY));
        if (Number.isFinite(savedHz) && savedHz >= REFERENCE_HZ_MIN && savedHz <= REFERENCE_HZ_MAX) {
          setReferenceHz(savedHz);
        }
        const savedTemperament = localStorage.getItem(TEMPERAMENT_STORAGE_KEY);
        if (savedTemperament && savedTemperament in TEMPERAMENT_PROFILES) {
          setTemperament(savedTemperament as TemperamentId);
        }
        const savedKeyPc = Number(localStorage.getItem(TEMPERAMENT_KEY_STORAGE_KEY));
        if (Number.isInteger(savedKeyPc) && savedKeyPc >= 0 && savedKeyPc < 12) setTemperamentKeyPc(savedKeyPc);
        setCustomCents(loadCustomTemperamentCents(localStorage.getItem(CUSTOM_TEMPERAMENT_STORAGE_KEY)));
        const savedSensitivity = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
        if (savedSensitivity && (SENSITIVITY_ORDER as string[]).includes(savedSensitivity)) {
          setSensitivity(savedSensitivity as Sensitivity);
        }
        const savedDamping = localStorage.getItem(DAMPING_STORAGE_KEY);
        if (savedDamping && (DAMPING_ORDER as string[]).includes(savedDamping)) {
          setDamping(savedDamping as Damping);
        }
        const savedHistoryMode = localStorage.getItem(HISTORY_MODE_STORAGE_KEY);
        if (savedHistoryMode === "line" || savedHistoryMode === "staff") setHistoryMode(savedHistoryMode);
        const savedPrecision = localStorage.getItem(PRECISION_STORAGE_KEY);
        if (savedPrecision === "standard" || savedPrecision === "fine" || savedPrecision === "ultra") {
          setPrecision(savedPrecision);
        }
        const savedKeyCentreMode = localStorage.getItem(KEY_CENTRE_MODE_STORAGE_KEY);
        if (savedKeyCentreMode === "concert" || savedKeyCentreMode === "written") setKeyCentreMode(savedKeyCentreMode);
      } catch {
        // A=440 equal temperament, medium sensitivity and normal damping are
        // the fallback when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const chooseNotation = useCallback((next: NotationSystem) => {
    setNotation(next);
    try {
      localStorage.setItem(NOTATION_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const chooseSaTonic = useCallback((next: number) => {
    setSaTonic(next);
    try {
      localStorage.setItem(TONIC_STORAGE_KEY, String(next));
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const chooseReferenceHz = useCallback((next: number) => {
    setReferenceHz(next);
    try {
      localStorage.setItem(REFERENCE_HZ_STORAGE_KEY, String(next));
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const chooseTemperament = useCallback((next: TemperamentId) => {
    setTemperament(next);
    try {
      localStorage.setItem(TEMPERAMENT_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const chooseTemperame…11609 tokens truncated…select"
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
        </div>
      )}
    </div>
  );
});

const TunerView = memo(function TunerView({
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
  instrument: (typeof INSTRUMENTS)[InstrumentId];
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
              ? `${fullNoteLabel(reading.writtenMidi, notation, saTonic)}, ${Math.abs(reading.cents)} cents ${reading.cents === 0 ? "in tune" : reading.cents > 0 ? "sharp" : "flat"}`
              : trackerLabel}
          </p>
          <div className="tuner-card-top">
            <span className="status-label"><CircleDot size={15} /> {trackerReading.state === "locked" ? direction : trackerLabel}</span>
            <div className="tuner-top-actions"><label className="precision-picker"><span>Precision</span><select value={precision} onChange={(event) => onPrecisionChange(event.target.value as "standard" | "fine" | "ultra")} aria-label="Tuner precision"><option value="standard">Standard ±10¢</option><option value="fine">Fine ±5¢</option><option value="ultra">Ultra ±2¢</option></select></label><button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear reference A</button><button className="small-action" aria-keyshortcuts="?" onClick={onOpenKeyboardHelp}>Keyboard</button></div>
          </div>

          <div className="note-readout">
            {notation === "staff" ? (
              <StaffNote
                midi={reading?.writtenMidi ?? null}
                clef={instrument.clef}
                title={reading ? `Written ${fullNoteLabel(reading.writtenMidi, "western")}` : "No note detected yet"}
              />
            ) : (
              <div className={`note-name ${reading ? "" : "is-empty"}`}>
                {reading ? (
                  <>
                    {noteName(reading.writtenMidi, notation, saTonic)}
                    <sup>{octaveLabel(reading.writtenMidi, notation, saTonic)}</sup>
                  </>
                ) : (
                  "—"
                )}
              </div>
            )}
            <div className="pitch-detail">
              <span>{reading ? `${reading.cents > 0 ? "+" : ""}${reading.cents} cents` : "Waiting for a stable tone"}</span>
              <small>{reading ? `${reading.hz.toFixed(1)} Hz · sounds ${concertNote}` : "No note is shown until confidence passes the lock threshold"}</small>
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
