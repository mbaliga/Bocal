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
  LockKeyhole,
  Mic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Rotate3D,
  Settings2,
  Smartphone,
  Sparkles,
  TimerReset,
  Volume2,
  Waves,
  Wind,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisView } from "./AnalysisView";
import {
  BOCAL_ONBOARDING_KEY,
  InstrumentPickerExperience,
  OnboardingGuide,
} from "./InstrumentExperience";
import { StablePitchTracker, type PitchTrackerReading } from "./pitch-engine";
import { INSTRUMENT_ORDER, INSTRUMENTS, type InstrumentId } from "./instruments";
import { PracticeView, PulseView } from "./PracticeTools";
import {
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  summarizeTunerSession,
  withTunerSession,
} from "./skill-rating";

const SaxophoneLab = dynamic(
  () => import("./SaxophoneLab").then((module) => module.SaxophoneLab),
  { ssr: false },
);

type Mode = "tune" | "sax" | "pulse" | "analyze" | "practice";
type RailSide = "left" | "right";

type PitchReading = {
  hz: number;
  note: string;
  octave: number;
  cents: number;
};

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const NAVIGATION_SIDE_STORAGE_KEY = "bocal-navigation-side";

function pitchFromFrequency(hz: number, writtenOffset: number): PitchReading {
  const concertMidiFloat = 69 + 12 * Math.log2(hz / 440);
  const concertMidi = Math.round(concertMidiFloat);
  const writtenMidi = concertMidi + writtenOffset;
  const targetHz = 440 * 2 ** ((concertMidi - 69) / 12);
  return {
    hz,
    note: NOTE_NAMES[((writtenMidi % 12) + 12) % 12],
    octave: Math.floor(writtenMidi / 12) - 1,
    cents: Math.round(1200 * Math.log2(hz / targetHz)),
  };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const navItems: { id: Mode; label: string; icon: typeof Crosshair }[] = [
  { id: "tune", label: "Tune", icon: Crosshair },
  { id: "sax", label: "3D lab", icon: Wind },
  { id: "pulse", label: "Pulse", icon: Waves },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "practice", label: "Practice", icon: Music2 },
];

// Everything below derives from the one bar curve "M34 62 Q200 30 366 62"
// (viewBox 400×100 — x is linear in t since the three control x's are evenly
// spaced, y(t) = 62 − 64t + 64t²). Five seats at t = .1/.3/.5/.7/.9.
//
// ARC_SEATS: button centers, taken from the Bézier at each t — the row rides the curve.
// ARC_TILTS: the curve's tangent angle at each seat, so icons/labels lie along the arc.
const ARC_SEATS = [
  { left: "16.8%", top: "56.2%" },
  { left: "33.4%", top: "48.6%" },
  { left: "50.0%", top: "46.0%" },
  { left: "66.6%", top: "48.6%" },
  { left: "83.2%", top: "56.2%" },
];
const ARC_TILTS = ["-8.77deg", "-4.41deg", "0deg", "4.41deg", "8.77deg"];


export default function Home() {
  const [mode, setMode] = useState<Mode>("tune");
  const [instrumentId, setInstrumentId] = useState<InstrumentId>("alto-sax");
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [downloadCenterOpen, setDownloadCenterOpen] = useState(false);
  const [railSide, setRailSide] = useState<RailSide>("left");
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
        const saved = localStorage.getItem(NAVIGATION_SIDE_STORAGE_KEY);
        if (saved === "left" || saved === "right") setRailSide(saved);
      } catch {
        // The navigation remains on the left when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
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
    } catch {
      // The tuner remains fully functional when device storage is unavailable.
    }
  }, []);

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
            const nextReading = pitchFromFrequency(nextTrackerReading.hz, instrument.writtenOffset);
            setReading(nextReading);
            if (nextTrackerReading.accepted && tunerEvidenceRef.current) {
              tunerEvidenceRef.current.cents.push(nextReading.cents);
              tunerEvidenceRef.current.midiNotes.push(Math.round(69 + 12 * Math.log2(nextReading.hz / 440)));
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
    oscillator.frequency.value = 261.63;
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

  const chooseInstrument = (nextId: InstrumentId) => {
    if (listening) stopListening();
    setInstrumentId(nextId);
    setInstrumentPickerOpen(false);
  };

  const completeOnboarding = () => {
    try { localStorage.setItem(BOCAL_ONBOARDING_KEY, "complete"); } catch { /* The guide can close without storage. */ }
    setOnboardingOpen(false);
  };

  const chooseRailSide = (side: RailSide) => {
    setRailSide(side);
    try { localStorage.setItem(NAVIGATION_SIDE_STORAGE_KEY, side); } catch { /* The preference still applies for this visit. */ }
  };

  return (
    <div className={`app-shell nav-${railSide}`}>
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

      <main className="main-stage">
        <header className="top-bar">
          <div className="instrument-picker-wrap">
            <button className="instrument-picker" aria-label="Choose instrument" aria-expanded={instrumentPickerOpen} onClick={() => setInstrumentPickerOpen((value) => !value)}>
              <span className="instrument-icon"><Wind size={18} /></span>
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
            <button className="icon-button" aria-label="Open settings and handoff" aria-expanded={downloadCenterOpen} onClick={() => setDownloadCenterOpen(true)}><MoreHorizontal size={20} /></button>
          </div>
        </header>

        {instrumentPickerOpen && <InstrumentPickerExperience open selectedId={instrumentId} onSelect={chooseInstrument} onClose={() => setInstrumentPickerOpen(false)} />}
        {onboardingOpen && <OnboardingGuide open selectedId={instrumentId} onSelect={chooseInstrument} onComplete={completeOnboarding} />}
        {downloadCenterOpen && <DownloadCenter railSide={railSide} onRailSideChange={chooseRailSide} onClose={() => setDownloadCenterOpen(false)} onOpenOnboarding={() => { setDownloadCenterOpen(false); setOnboardingOpen(true); }} />}

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
          />
        )}
        {mode === "sax" && <SaxophoneLab onBack={() => selectMode("tune")} instrumentId={instrumentId} />}
        {mode === "pulse" && <PulseView />}
        {mode === "analyze" && <AnalysisView />}
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
          <div className="dock-side-button" aria-hidden="true"><LockKeyhole size={16} /></div>
          <div className="dock-pill" role="group" aria-label="Instrument">
            {INSTRUMENT_ORDER.map((id) => (
              <button
                key={id}
                className={instrumentId === id ? "is-active" : ""}
                aria-pressed={instrumentId === id}
                onClick={() => chooseInstrument(id)}
              >
                {INSTRUMENTS[id].shortName}
              </button>
            ))}
          </div>
          <button className="dock-side-button" aria-label="Open profile">TU</button>
        </div>
        <nav className="mobile-nav is-arc" aria-label="Primary navigation">
          {/* The 4:1 box uses height:0/padding-bottom:25% (NOT the aspect-ratio
              property, which collapsed to zero height on some Android WebView
              renderers and scrambled every percentage seat); .arc-inner is the
              box the SVG and seats position against. */}
          <div className="arc-inner">
            <svg className="arc-shape" viewBox="0 0 400 100" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="arcSheen" x1="0" y1="10" x2="0" y2="92" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(255,255,255,0.09)" />
                  <stop offset="0.45" stopColor="rgba(255,255,255,0.015)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <path d="M34 62 Q200 30 366 62" fill="none" stroke="#33333a" strokeWidth="60" strokeLinecap="round" />
              <path d="M34 62 Q200 30 366 62" fill="none" stroke="rgba(17,17,19,0.98)" strokeWidth="58" strokeLinecap="round" />
              <path d="M34 62 Q200 30 366 62" fill="none" stroke="url(#arcSheen)" strokeWidth="56" strokeLinecap="round" />
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
  onClose,
  onOpenOnboarding,
}: {
  railSide: RailSide;
  onRailSideChange: (side: RailSide) => void;
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
    {
      href: "/downloads/Bocal-native-debug.apk",
      title: "Android debug APK",
      copy: "Bocal 0.2.0 for Android 8+: tuner, bronze sax lab, key glows, onboarding, curved navigation and local practice history. Debug-signed for direct testing.",
      icon: Smartphone,
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
          <div><strong>Verified debug build.</strong><p>Built and signature-checked. Physical-phone checks for microphone accuracy, latency, interruptions and rotation are still open.</p></div>
        </div>
        <button className="replay-onboarding" onClick={onOpenOnboarding}><Sparkles size={15} /> Replay the onboarding guide</button>
      </section>
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
}) {
  const inTune = trackerReading.state === "locked" && reading !== null && Math.abs(reading.cents) <= 5;
  const direction = reading === null ? "Waiting" : reading.cents > 5 ? "Sharp" : reading.cents < -5 ? "Flat" : "Centered";
  const markerPosition = reading === null ? 50 : Math.max(4, Math.min(96, 50 + reading.cents * 0.8));
  const concertNote = useMemo(() => {
    if (!reading) return null;
    const writtenMidi = (reading.octave + 1) * 12 + NOTE_NAMES.indexOf(reading.note);
    const concertMidi = writtenMidi - instrument.writtenOffset;
    return `${NOTE_NAMES[((concertMidi % 12) + 12) % 12]}${Math.floor(concertMidi / 12) - 1}`;
  }, [instrument.writtenOffset, reading]);
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
              ? { title: "Right in the middle.", copy: "You’re within five cents. Keep the air and embouchure where they are." }
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
            <button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear concert C</button>
          </div>

          <div className="note-readout">
            <div className={`note-name ${reading ? "" : "is-empty"}`}>{reading ? <>{reading.note}<sup>{reading.octave}</sup></> : "—"}</div>
            <div className="pitch-detail">
              <span>{reading ? `${reading.cents > 0 ? "+" : ""}${reading.cents} cents` : "Waiting for a stable tone"}</span>
              <small>{reading ? `${reading.hz.toFixed(1)} Hz · sounds ${concertNote}` : "No note is shown until confidence passes the lock threshold"}</small>
            </div>
          </div>

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

          <article className="sax-card" onClick={onOpenSax} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenSax()}>
            <div>
              <span className="card-kicker"><Rotate3D size={15} /> {instrument.id === "alto-sax" ? "Fingering lab" : "Anatomy preview"}</span>
              <h3>{instrument.id === "alto-sax" ? (reading ? `See ${reading.note}${reading.octave} on the sax.` : "Open the interactive alto sax.") : "Explore the oboe up close."}</h3>
              <p>{instrument.id === "alto-sax" ? "Open the sax and the keys for this note will light up." : "Turn the model and tap its rods, springs and keywork."}</p>
            </div>
            <div className={`sax-card-photo ${instrument.id === "oboe" ? "is-oboe" : ""}`} aria-hidden="true" />
            <span className="round-arrow"><ArrowRight size={17} /></span>
          </article>
        </aside>
      </div>

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
