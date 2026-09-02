"use client";

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
  FileText,
  Guitar,
  LockKeyhole,
  Mic,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisView } from "./AnalysisView";
import {
  BOCAL_ONBOARDING_KEY,
  InstrumentPickerExperience,
  OnboardingGuide,
} from "./InstrumentExperience";
import { GuitarStudio } from "./GuitarStudio";
import { ToneGenerator } from "./ToneGenerator";
import { StablePitchTracker, type PitchTrackerReading } from "./pitch-engine";
import { INSTRUMENTS, isInstrumentId, type InstrumentId, type InstrumentProfile } from "./instruments";
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
  REFERENCE_HZ_DEFAULT,
  REFERENCE_HZ_MAX,
  REFERENCE_HZ_MIN,
  REFERENCE_HZ_STEP,
  TEMPERAMENT_ORDER,
  TEMPERAMENT_PROFILES,
  type TemperamentId,
  type TuningOptions,
} from "./tuning";
import { recordPracticeActivity } from "./practice-data";

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
  return { kicker: "Lab", heading: `Open the ${name} tools.`, body: "Tuner and practice tools are ready for this instrument." };
}

const navItems: { id: Mode; label: string; icon: typeof Crosshair }[] = [
  { id: "tune", label: "Tune", icon: Crosshair },
  { id: "sax", label: "3D lab", icon: Wind },
  { id: "pulse", label: "Pulse", icon: Waves },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "practice", label: "Practice", icon: Music2 },
];

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
  const frameRef = useRef<number | null>(null);
  const trackerRef = useRef(new StablePitchTracker());
  const tunerEvidenceRef = useRef<{ startedAt: number; cents: number[]; midiNotes: number[] } | null>(null);
  const instrument = INSTRUMENTS[instrumentId];
  const tuningOptions = useMemo<TuningOptions>(
    () => ({ referenceHz, temperament, keyPc: temperamentKeyPc }),
    [referenceHz, temperament, temperamentKeyPc],
  );
  // Read from a ref inside the sampling loop below, rather than closing over
  // tuningOptions at the moment the loop started, so changing the reference
  // pitch or temperament mid-session takes effect on the very next frame
  // instead of only on the next "Start live tuner" press.
  const tuningOptionsRef = useRef(tuningOptions);
  useEffect(() => {
    tuningOptionsRef.current = tuningOptions;
  }, [tuningOptions]);
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
      } catch {
        // A=440 equal temperament is the fallback when device storage is unavailable.
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

  const chooseTemperamentKeyPc = useCallback((next: number) => {
    setTemperamentKeyPc(next);
    try {
      localStorage.setItem(TEMPERAMENT_KEY_STORAGE_KEY, String(next));
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  useEffect(() => {
    if (!sessionActive) return;
    const timer = window.setInterval(() => setSessionSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    },
    [],
  );

  const saveTunerEvidence = useCallback(() => {
    const capture = tunerEvidenceRef.current;
    tunerEvidenceRef.current = null;
    if (!capture) return;
    const summary = summarizeTunerSession(
      capture.cents,
      capture.midiNotes,
      performance.now() - capture.startedAt,
    );
    if (!summary) return;
    try {
      const current = parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY));
      localStorage.setItem(SKILL_EVIDENCE_STORAGE_KEY, JSON.stringify(withTunerSession(current, summary)));
      window.dispatchEvent(new Event("bocal-skill-evidence"));
      recordPracticeActivity({
        type: "tuning",
        seconds: summary.durationMs / 1000,
        instrumentId: instrument.id,
        notes: summary.midiNotes.map((midi) => fullNoteLabel(midi, "western")),
        label: `${instrument.shortName} tuner session`,
      });
    } catch {
      // The tuner remains fully functional when device storage is unavailable.
    }
  }, [instrument.id, instrument.shortName]);

  const stopListening = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    saveTunerEvidence();
    trackerRef.current.reset();
    setListening(false);
    setReading(null);
    setTrackerReading({ state: "silence", hz: null, rawHz: null, confidence: 0, rms: 0, gate: 0.009, accepted: false });
  }, [saveTunerEvidence]);

  const startListening = useCallback(async () => {
    if (listening) {
      stopListening();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicMessage("Microphone access is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      });
      const audioContext = !audioContextRef.current || audioContextRef.current.state === "closed"
        ? new AudioContext()
        : audioContextRef.current;
      if (audioContext.state === "suspended") await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      setMicMessage("");
      setListening(true);
      setReading(null);
      setPitchTrace([]);
      setAcceptedFrames(0);
      trackerRef.current.reset();
      tunerEvidenceRef.current = { startedAt: performance.now(), cents: [], midiNotes: [] };
      let lastAnalysisAt = Number.NEGATIVE_INFINITY;

      const sample = () => {
        const now = performance.now();
        if (now - lastAnalysisAt >= 30) {
          lastAnalysisAt = now;
          analyser.getFloatTimeDomainData(data);
          const nextTrackerReading = trackerRef.current.process(data, audioContext.sampleRate, now);
          setTrackerReading(nextTrackerReading);
          if (nextTrackerReading.hz !== null) {
            const nextReading = pitchFromFrequency(nextTrackerReading.hz, instrument.writtenOffset, tuningOptionsRef.current);
            setReading(nextReading);
            if (nextTrackerReading.accepted && tunerEvidenceRef.current) {
              tunerEvidenceRef.current.cents.push(nextReading.cents);
              tunerEvidenceRef.current.midiNotes.push(nextReading.concertMidi);
              setAcceptedFrames(tunerEvidenceRef.current.cents.length);
              setPitchTrace((current) => [...current, nextReading.cents].slice(-18));
            }
          } else {
            setReading(null);
          }
        }
        frameRef.current = requestAnimationFrame(sample);
      };
      sample();
    } catch {
      setMicMessage("Microphone permission is needed for live tuning.");
    }
  }, [instrument.writtenOffset, listening, stopListening]);

  const playReferenceTone = useCallback(() => {
    const audioContext = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioContext;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    // Concert A4 (MIDI 69) at the chosen reference pitch and temperament, so
    // the tone itself demonstrates the calibration rather than always being
    // a fixed 261.63 Hz regardless of what the player set it to.
    oscillator.frequency.value = targetHzFor(69, tuningOptionsRef.current);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.45);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1.5);
  }, []);

  const toggleSession = () => {
    if (sessionActive) {
      try {
        const existing = JSON.parse(localStorage.getItem("bocal-sessions") ?? "[]");
        existing.unshift({ date: new Date().toISOString(), seconds: sessionSeconds });
        localStorage.setItem("bocal-sessions", JSON.stringify(existing.slice(0, 30)));
      } catch {
        // Device-local history is an enhancement; the session still works without it.
      }
      setSessionSeconds(0);
    }
    setSessionActive((value) => !value);
  };

  const selectMode = useCallback((nextMode: Mode) => {
    if (nextMode !== "tune" && listening) stopListening();
    setMode(nextMode);
  }, [listening, stopListening]);

  // The dock pill is a doubling toggle, not a library. Bocal now carries seven
  // instruments, and seven seats will not fit on an arc at phone width -- nor
  // would a player want them there. The pill holds the instrument in your hands
  // and the one you put down; the header picker reaches the whole library, and
  // choosing from it demotes the outgoing instrument into the second seat.
  const chooseInstrument = useCallback(
    (nextId: InstrumentId) => {
      if (nextId === instrumentId) {
        setInstrumentPickerOpen(false);
        return;
      }
      if (listening) stopListening();
      setPartnerInstrumentId(instrumentId);
      setInstrumentId(nextId);
      setInstrumentPickerOpen(false);
      try {
        localStorage.setItem(INSTRUMENT_STORAGE_KEY, nextId);
        localStorage.setItem(PARTNER_INSTRUMENT_STORAGE_KEY, instrumentId);
      } catch {
        // The choice still applies for this visit.
      }
    },
    [instrumentId, listening, stopListening],
  );

  const completeOnboarding = () => {
    try { localStorage.setItem(BOCAL_ONBOARDING_KEY, "complete"); } catch { /* The guide can close without storage. */ }
    setOnboardingOpen(false);
  };

  // Keyboard access for pointer/keyboard devices (ChromeOS, laptops,
  // foldables docked to a keyboard). Digits jump straight to a destination;
  // arrows walk the nav. Suppressed while typing so the lesson-note textarea
  // and any future text input keep their keys.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (instrumentPickerOpen || onboardingOpen || downloadCenterOpen) return;

      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= navItems.length) {
        event.preventDefault();
        selectMode(navItems[digit - 1].id);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const index = navItems.findIndex((item) => item.id === mode);
        if (index < 0) return;
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        selectMode(navItems[(index + step + navItems.length) % navItems.length].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [downloadCenterOpen, instrumentPickerOpen, mode, onboardingOpen, selectMode]);

  const chooseRailSide = (side: RailSide) => {
    setRailSide(side);
    try { localStorage.setItem(NAVIGATION_SIDE_STORAGE_KEY, side); } catch { /* The preference still applies for this visit. */ }
  };

  const chooseTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* The preference still applies for this visit. */ }
  };

  return (
    <div className={`app-shell nav-${railSide}`}>
      <a className="skip-to-content" href="#bocal-main">Skip to content</a>
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-mark" onClick={() => selectMode("tune")} aria-label="Bocal home">
          <span className="brand-glyph"><Wind size={20} strokeWidth={2.4} /></span>
          <span>bocal</span>
        </button>

        <nav className="rail-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`rail-button ${mode === item.id ? "is-active" : ""}`}
                onClick={() => selectMode(item.id)}
                aria-current={mode === item.id ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
          <div className="privacy-dot"><LockKeyhole size={14} /> Local only</div>
          <button className="avatar" aria-label="Open Bocal settings" onClick={() => setDownloadCenterOpen(true)}>TU</button>
        </div>
      </aside>

      <main className="main-stage" id="bocal-main" tabIndex={-1}>
        <header className="top-bar">
          <div className="instrument-picker-wrap">
            <button className="instrument-picker" aria-label="Choose instrument" aria-expanded={instrumentPickerOpen} onClick={() => setInstrumentPickerOpen((value) => !value)}>
              <span className="instrument-icon">{instrument.id === "guitar" ? <Guitar size={18} /> : <Wind size={18} />}</span>
              <span><small>Instrument</small>{instrument.shortName} · {instrument.pitchLabel}</span>
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="top-actions">
            <div className={`session-clock ${sessionActive ? "is-running" : ""}`}>
              <Clock3 size={15} /> {formatTime(sessionSeconds)}
            </div>
            <button className="button secondary" onClick={toggleSession}>
              {sessionActive ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {sessionActive ? "End session" : "Start practice"}
            </button>
            <button className="icon-button theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`} aria-pressed={theme === "light"} onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="icon-button" aria-label="Open settings and handoff" aria-expanded={downloadCenterOpen} onClick={() => setDownloadCenterOpen(true)}><MoreHorizontal size={20} /></button>
          </div>
        </header>

        {instrumentPickerOpen && <InstrumentPickerExperience open selectedId={instrumentId} onSelect={chooseInstrument} onClose={() => setInstrumentPickerOpen(false)} />}
        {onboardingOpen && <OnboardingGuide open selectedId={instrumentId} onSelect={chooseInstrument} onComplete={completeOnboarding} />}
        {downloadCenterOpen && <DownloadCenter railSide={railSide} onRailSideChange={chooseRailSide} theme={theme} onThemeChange={chooseTheme} onClose={() => setDownloadCenterOpen(false)} onOpenOnboarding={() => { setDownloadCenterOpen(false); setOnboardingOpen(true); }} />}

        {mode === "tune" && (
          <TunerView
            reading={reading}
            listening={listening}
            trackerReading={trackerReading}
            pitchTrace={pitchTrace}
            acceptedFrames={acceptedFrames}
            sessionSeconds={sessionSeconds}
            micMessage={micMessage}
            onListen={startListening}
            onReference={playReferenceTone}
            onOpenSax={() => selectMode("sax")}
            instrument={instrument}
            notation={notation}
            saTonic={saTonic}
            onNotationChange={chooseNotation}
            onSaTonicChange={chooseSaTonic}
            referenceHz={referenceHz}
            temperament={temperament}
            temperamentKeyPc={temperamentKeyPc}
            onReferenceHzChange={chooseReferenceHz}
            onTemperamentChange={chooseTemperament}
            onTemperamentKeyPcChange={chooseTemperamentKeyPc}
          />
        )}
        {mode === "sax" && (instrumentId === "guitar"
          ? <GuitarStudio reading={reading ? { hz: reading.hz, cents: reading.cents, midi: reading.concertMidi } : null} listening={listening} onListen={startListening} />
          : <SaxophoneLab onBack={() => selectMode("tune")} instrumentId={instrumentId} notation={notation} saTonic={saTonic} />)}
        {mode === "pulse" && <PulseView />}
        {mode === "analyze" && <AnalysisView instrument={instrument} notation={notation} saTonic={saTonic} />}
        {mode === "practice" && (
          <PracticeView
            onOpenTuner={() => selectMode("tune")}
            onOpenSax={() => selectMode("sax")}
            onOpenPulse={() => selectMode("pulse")}
          />
        )}
      </main>

<div className="mobile-dock">
        {/* Composition mirrors the curved-keyboard reference: two circular
            side buttons flanking a centered segmented pill (here the real
            instrument switch), floating above an arced bar whose active tab
            is a compact pill hugging its glyph. Inverted for the dark theme:
            the reference's dark-pill-on-light-bar becomes ink-on-dark. */}
        <div className="dock-top">
          {/* Left circle is a privacy BADGE (mirrors the rail's "Local only"
              dot), deliberately styled flat so it doesn't read as a button. */}
          <div className="dock-side-button is-badge" aria-hidden="true"><LockKeyhole size={16} /></div>
          <div className="dock-pill" role="group" aria-label="Instrument">
            <svg className="pill-track" viewBox={`0 0 ${PILL_VIEWBOX.w} ${PILL_VIEWBOX.h}`} aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="pillFill" x1="0" y1="6" x2="0" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#1a1c23" />
                  <stop offset="1" stopColor="#23262f" />
                </linearGradient>
              </defs>
              {/* Recessed track: dark seam, then a bottom-lit fill, so the
                  groove reads as cut into the dock (Hyle crater logic). */}
              <path d={PILL_PATH} fill="none" stroke="#0a0b0f" strokeWidth="36" strokeLinecap="round" />
              <path d={PILL_PATH} fill="none" stroke="url(#pillFill)" strokeWidth="32" strokeLinecap="round" />
            </svg>
            {pillInstruments.map((id, index) => {
              const seat = pillSeat(index, pillInstruments.length);
              return (
                <button
                  key={id}
                  className={instrumentId === id ? "is-active" : ""}
                  aria-pressed={instrumentId === id}
                  title={INSTRUMENTS[id].name}
                  style={{ left: seat.left, top: seat.top, "--tilt": seat.tilt } as React.CSSProperties}
                  onClick={() => chooseInstrument(id)}
                >
                  {INSTRUMENTS[id].shortName}
                </button>
              );
            })}
          </div>
          <button className="dock-side-button" aria-label="Open Bocal settings" onClick={() => setDownloadCenterOpen(true)}>TU</button>
        </div>
        <nav className="mobile-nav is-arc" aria-label="Primary navigation">
          {/* The 4:1 box uses height:0/padding-bottom:25% (NOT the aspect-ratio
              property, which collapsed to zero height on some Android WebView
              renderers and scrambled every percentage seat); .arc-inner is the
              box the SVG and seats position against. */}
          <div className="arc-inner">
            <svg className="arc-shape" viewBox="0 0 400 100" aria-hidden="true" focusable="false">
              {/* Molded-bar shading per the Hyle tactile kit (gunmetal set):
                  no outline ring — the shape is carried by light. A dark seam
                  underlay, a vertical srf gradient fill, a top-lip sheen, and
                  a faint bottom rim-light where the bar catches bounce. */}
              <defs>
                <linearGradient id="arcFill" x1="0" y1="8" x2="0" y2="94" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#282d37" />
                  <stop offset="0.55" stopColor="#1f2129" />
                  <stop offset="1" stopColor="#171922" />
                </linearGradient>
                <linearGradient id="arcSheen" x1="0" y1="10" x2="0" y2="92" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(255,255,255,0.12)" />
                  <stop offset="0.4" stopColor="rgba(255,255,255,0.02)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
                <linearGradient id="arcRim" x1="0" y1="10" x2="0" y2="94" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(255,255,255,0)" />
                  <stop offset="0.8" stopColor="rgba(255,255,255,0)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0.07)" />
                </linearGradient>
              </defs>
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="#0c0e13" strokeWidth="61" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcFill)" strokeWidth="58" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcSheen)" strokeWidth="56" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcRim)" strokeWidth="58" strokeLinecap="round" />
            </svg>
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  className={active ? "is-active" : ""}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  style={{ left: ARC_SEATS[index].left, top: ARC_SEATS[index].top, "--tilt": ARC_TILTS[index] } as React.CSSProperties}
                  onClick={() => selectMode(item.id)}
                >
                  <Icon size={19} />{active && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}


function DownloadCenter({
  railSide,
  onRailSideChange,
  theme,
  onThemeChange,
  onClose,
  onOpenOnboarding,
}: {
  railSide: RailSide;
  onRailSideChange: (side: RailSide) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onClose: () => void;
  onOpenOnboarding: () => void;
}) {
  const downloads = [
    {
      href: "/downloads/BOCAL_HANDOFF.md",
      title: "Bocal handoff",
      copy: "Research, user journeys, feature scope, saxophone notes, architecture, Android status and release checks in one file.",
      icon: FileText,
    },
  ];
  const modelSources: Array<{ instrument: string; status: string; tone: "ready" | "review" | "blocked"; href?: string }> = [
    { instrument: "Alto saxophone", status: "In Bocal", tone: "ready", href: "https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27" },
    { instrument: "Oboe", status: "In Bocal", tone: "ready", href: "https://sketchfab.com/3d-models/oboe-howarth-conservatoire-s20c-instrument-bfa1bb7fd7ef4f7c9d3c843f481a38c8" },
    { instrument: "Flute", status: "CC BY candidate · needs player review", tone: "review", href: "https://sketchfab.com/3d-models/flute-08cb4375f9924366b725c439fd6163a8" },
    { instrument: "Tenor saxophone", status: "Licensed candidate · purchase required", tone: "review", href: "https://www.cgtrader.com/3d-models/sports/music/brass-tenor-saxophone" },
    { instrument: "Bassoon", status: "Licensed candidate · purchase required", tone: "review", href: "https://www.cgtrader.com/3d-models/furniture/other/fagott-bassoon" },
    { instrument: "Clarinet", status: "Blocked by non-commercial licence", tone: "blocked", href: "https://sketchfab.com/3d-models/clarinet-model-with-annotations-c47ddcb26eeb4fbd804a45c82f77ba31" },
    { instrument: "Soprano saxophone", status: "No acceptable source yet · commission", tone: "blocked" },
  ];
  return (
    <div className="download-overlay" role="presentation">
      <section className="download-dialog" role="dialog" aria-modal="true" aria-labelledby="download-title">
        <header>
          <div><p className="eyebrow">Settings & model library</p><h2 id="download-title">Make Bocal fit your setup.</h2><p>Choose which edge holds the landscape arc, review model readiness, or download the current handoff.</p></div>
          <button onClick={onClose} aria-label="Close settings"><X size={19} /></button>
        </header>
        <section className="settings-panel" aria-labelledby="navigation-side-title">
          <div><Settings2 size={18} /><span><strong id="navigation-side-title">Landscape navigation</strong><p>The floating mobile arc can sit against either edge.</p></span></div>
          <div className="side-choice" role="radiogroup" aria-label="Landscape navigation side">
            <button role="radio" aria-checked={railSide === "left"} className={railSide === "left" ? "is-active" : ""} onClick={() => onRailSideChange("left")}>Left</button>
            <button role="radio" aria-checked={railSide === "right"} className={railSide === "right" ? "is-active" : ""} onClick={() => onRailSideChange("right")}>Right</button>
          </div>
        </section>
        <section className="settings-panel" aria-labelledby="appearance-title">
          <div><Sun size={18} /><span><strong id="appearance-title">Appearance</strong><p>Choose an illuminated light surface or Bocal’s deep studio finish.</p></span></div>
          <div className="side-choice theme-choice" role="radiogroup" aria-label="Appearance">
            <button role="radio" aria-checked={theme === "light"} className={theme === "light" ? "is-active" : ""} onClick={() => onThemeChange("light")}>Light</button>
            <button role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "is-active" : ""} onClick={() => onThemeChange("dark")}>Dark</button>
          </div>
        </section>
        <section className="model-source-panel" aria-labelledby="model-source-title">
          <header><div><strong id="model-source-title">Educational model sourcing</strong><p>Only models with usable rights and player-checked keywork will enter the learning lab.</p></div><span>{modelSources.filter((item) => item.tone === "ready").length} integrated</span></header>
          <div className="model-source-list">
            {modelSources.map((source) => {
              const content = <><span>{source.instrument}</span><em className={`is-${source.tone}`}>{source.status}</em>{source.href && <ArrowRight size={13} />}</>;
              return source.href ? <a key={source.instrument} href={source.href} target="_blank" rel="noreferrer">{content}</a> : <div key={source.instrument}>{content}</div>;
            })}
          </div>
        </section>
        <div className="download-grid">
          {downloads.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href} download>
                <i><Icon size={19} /></i>
                <div><strong>{item.title}</strong><p>{item.copy}</p><span>Download <Download size={13} /></span></div>
              </a>
            );
          })}
        </div>
        <div className="apk-blocker">
          <Smartphone size={18} />
          <div><strong>Android release promotion is pending.</strong><p>A current artifact will appear here only after release signing, installation, cold launch, and physical-device audio checks pass.</p></div>
        </div>
        <button className="replay-onboarding" onClick={onOpenOnboarding}><Sparkles size={15} /> Replay the onboarding guide</button>
      </section>
    </div>
  );
}

function NotationPicker({
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
          <span>Sa is</span>
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
}

// Calibration is set-once-then-forget, unlike the notation switch a player
// might flip between mid-session, so it lives behind a disclosure instead of
// sitting open in the readout. Same crater/keycap vocabulary as
// NotationPicker above -- recessed track for what you choose from, raised
// keycap for what you chose.
function CalibrationPicker({
  referenceHz,
  temperament,
  temperamentKeyPc,
  onReferenceHzChange,
  onTemperamentChange,
  onTemperamentKeyPcChange,
}: {
  referenceHz: number;
  temperament: TemperamentId;
  temperamentKeyPc: number;
  onReferenceHzChange: (next: number) => void;
  onTemperamentChange: (next: TemperamentId) => void;
  onTemperamentKeyPcChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const profile = TEMPERAMENT_PROFILES[temperament];
  const hzLabel = Number.isInteger(referenceHz) ? String(referenceHz) : referenceHz.toFixed(1);
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
            <label>Temperament</label>
            <div className="notation-switch" role="radiogroup" aria-label="Temperament">
              {TEMPERAMENT_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={temperament === id}
                  className={temperament === id ? "is-active" : ""}
                  onClick={() => onTemperamentChange(id)}
                >
                  {TEMPERAMENT_PROFILES[id].label}
                </button>
              ))}
            </div>
            <p className="notation-hint">{profile.description}</p>
            {profile.needsKeyCentre && (
              <label className="notation-tonic">
                <span>Key centre</span>
                <select value={temperamentKeyPc} onChange={(event) => onTemperamentKeyPcChange(Number(event.target.value))}>
                  {TONIC_CHOICES.map((choice) => (
                    <option key={choice.pc} value={choice.pc}>
                      {choice.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TunerView({
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
}) {
  const [precision, setPrecision] = useState<"standard" | "fine" | "ultra">("fine");
  const tolerance = precision === "standard" ? 10 : precision === "ultra" ? 2 : 5;
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
          ? { title: "Keep holding it.", copy: "Bocal waits for three consistent readings before it changes the displayed note." }
          : trackerReading.state === "holding"
            ? { title: "The signal dipped.", copy: "Bocal holds the last note briefly instead of jumping. The display clears if the sound doesn’t return." }
            : inTune
              ? { title: "Right in the middle.", copy: `You’re within ${tolerance} cents. Keep the air and embouchure where they are.` }
              : { title: `${direction} by ${Math.abs(reading?.cents ?? 0)} cents.`, copy: direction === "Sharp" ? "Ease the jaw pressure without losing the air." : "Support the air and bring the pitch up without biting." };
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
        <section className={`tuner-card ${inTune ? "is-centered" : ""} ${reading ? "has-reading" : "is-waiting"}`} aria-live="polite">
          <div className="tuner-card-top">
            <span className="status-label"><CircleDot size={15} /> {trackerReading.state === "locked" ? direction : trackerLabel}</span>
            <div className="tuner-top-actions"><label className="precision-picker"><span>Precision</span><select value={precision} onChange={(event) => setPrecision(event.target.value as "standard" | "fine" | "ultra")} aria-label="Tuner precision"><option value="standard">Standard ±10¢</option><option value="fine">Fine ±5¢</option><option value="ultra">Ultra ±2¢</option></select></label><button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear reference A</button></div>
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
          />

          <div className="tune-scale" role="meter" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={reading?.cents} aria-label="Pitch deviation in cents">
            <div className="scale-labels"><span>−50</span><span>−25</span><strong>0</strong><span>+25</span><span>+50</span></div>
            <div className="scale-track">
              <span className="center-zone" />
              <span className="scale-center" />
              {reading && <span className="pitch-marker" style={{ left: `${markerPosition}%` }}><i /></span>}
            </div>
            <div className="direction-row"><span>Flatten ↓</span><strong>{inTune && <Check size={15} />}{centerInstruction}</strong><span>Sharpen ↑</span></div>
          </div>

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
            <p className="lock-policy"><LockKeyhole size={13} /> Noise gate · 3-frame lock · 550 ms dropout hold</p>
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
      />

      <section className="today-strip">
        <div className="today-title"><span>This session</span><strong>Your practice, as it happens.</strong></div>
        <Metric value={formatTime(sessionSeconds)} label="Practice timer" detail={sessionSeconds ? "current session" : "start when ready"} icon={TimerReset} />
        <Metric value={reading ? `±${Math.abs(reading.cents)}¢` : "—"} label="Pitch offset" detail={trackerReading.state === "locked" ? "accepted reading" : "awaiting lock"} icon={Crosshair} />
        <Metric value={`${acceptedFrames}`} label="Accepted frames" detail="this tuner run" icon={Activity} />
      </section>
    </div>
  );
}

function Metric({ value, label, detail, icon: Icon }: { value: string; label: string; detail: string; icon: typeof Activity }) {
  return (
    <div className="metric">
      <span className="metric-icon"><Icon size={17} /></span>
      <div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>
    </div>
  );
}
