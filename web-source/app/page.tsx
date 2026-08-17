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
  LockKeyhole,
  Mic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Rotate3D,
  Sparkles,
  TimerReset,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { PracticeView, PulseView } from "./PracticeTools";

const SaxophoneLab = dynamic(
  () => import("./SaxophoneLab").then((module) => module.SaxophoneLab),
  {
    ssr: false,
    loading: () => (
      <div className="content-wrap placeholder-view" role="status" aria-live="polite">
        <p className="eyebrow">Sax lab · Alto</p>
        <h1>Preparing the instrument.</h1>
        <p className="placeholder-lead">Loading the interactive fingering model…</p>
        <div className="placeholder-panel compact"><div className="model-orbit"><Rotate3D size={64} /></div></div>
      </div>
    ),
  },
);

type Mode = "tune" | "sax" | "pulse" | "analyze" | "practice";

type PitchReading = {
  hz: number;
  note: string;
  octave: number;
  cents: number;
};

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function pitchFromFrequency(hz: number): PitchReading {
  const concertMidiFloat = 69 + 12 * Math.log2(hz / 440);
  const concertMidi = Math.round(concertMidiFloat);
  const writtenMidi = concertMidi + 9;
  const targetHz = 440 * 2 ** ((concertMidi - 69) / 12);
  return {
    hz,
    note: NOTE_NAMES[((writtenMidi % 12) + 12) % 12],
    octave: Math.floor(writtenMidi / 12) - 1,
    cents: Math.round(1200 * Math.log2(hz / targetHz)),
  };
}

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.012) return { hz: -1, confidence: 0, rms };

  const minOffset = Math.floor(sampleRate / 1200);
  const maxOffset = Math.min(Math.floor(sampleRate / 55), Math.floor(buffer.length / 2));
  let bestOffset = -1;
  let bestCorrelation = 0;
  let lastCorrelation = 1;

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let difference = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) {
      difference += Math.abs(buffer[i] - buffer[i + offset]);
    }
    const correlation = 1 - difference / (buffer.length - offset);
    if (correlation > 0.9 && correlation > lastCorrelation && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
    lastCorrelation = correlation;
  }

  const hz = bestOffset > 0 && bestCorrelation > 0.92 ? sampleRate / bestOffset : -1;
  return { hz, confidence: bestCorrelation, rms };
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
// ARC_PILLS: the active highlight as a sub-segment of the same curve (quadratic
// reparam to [t−.075, t+.075]), stroked with round caps — an arc-shaped pill.
const ARC_SEATS = [
  { left: "16.8%", top: "56.2%" },
  { left: "33.4%", top: "48.6%" },
  { left: "50.0%", top: "46.0%" },
  { left: "66.6%", top: "48.6%" },
  { left: "83.2%", top: "56.2%" },
];
const ARC_TILTS = ["-8.77deg", "-4.41deg", "0deg", "4.41deg", "8.77deg"];
const ARC_PILLS = [
  "M42.30 60.44 Q67.20 55.88 92.10 52.76",
  "M108.70 50.84 Q133.60 48.20 158.50 47.00",
  "M175.10 46.36 Q200.00 45.64 224.90 46.36",
  "M241.50 47.00 Q266.40 48.20 291.30 50.84",
  "M307.90 52.76 Q332.80 55.88 357.70 60.44",
];


export default function Home() {
  const [mode, setMode] = useState<Mode>("tune");
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [tracker, setTracker] = useState({ level: 0, confidence: 0, accepted: 0 });
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionActive) return;
    const timer = window.setInterval(() => setSessionSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    },
    [],
  );

  const stopListening = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setListening(false);
    setReading(null);
    setTracker({ level: 0, confidence: 0, accepted: 0 });
  }, []);

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
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      setMicMessage("");
      setListening(true);

      // Three consecutive accepted frames before a note is shown, and a
      // 550 ms hold before a dropout clears it — the lock policy the UI states.
      let streak = 0;
      let lastGood = 0;
      const sample = () => {
        analyser.getFloatTimeDomainData(data);
        const { hz, confidence, rms } = autoCorrelate(data, audioContext.sampleRate);
        if (hz > 0) {
          streak += 1;
          lastGood = performance.now();
          if (streak >= 3) setReading(pitchFromFrequency(hz));
        } else {
          streak = 0;
          if (performance.now() - lastGood > 550) setReading(null);
        }
        setTracker({
          level: Math.min(1, rms / 0.12),
          confidence: hz > 0 ? confidence : 0,
          accepted: streak,
        });
        frameRef.current = requestAnimationFrame(sample);
      };
      sample();
    } catch {
      setMicMessage("Microphone permission is needed for live tuning.");
    }
  }, [listening, stopListening]);

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

  return (
    <div className="app-shell nav-left">
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-mark" onClick={() => setMode("tune")} aria-label="Bocal home">
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
                onClick={() => setMode(item.id)}
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
          <button className="avatar" aria-label="Open profile">TU</button>
        </div>
      </aside>

      <main className="main-stage">
        <header className="top-bar">
          <div className="instrument-picker-wrap">
          <button className="instrument-picker" aria-label="Choose instrument" aria-expanded={false}>
            <span className="instrument-icon"><Wind size={18} /></span>
            <span><small>Instrument</small>Alto sax · E♭</span>
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
            <button className="icon-button" aria-label="More options"><MoreHorizontal size={20} /></button>
          </div>
        </header>

        {mode === "tune" && (
          <TunerView
            reading={reading}
            tracker={tracker}
            listening={listening}
            micMessage={micMessage}
            onListen={startListening}
            onReference={playReferenceTone}
            onOpenSax={() => setMode("sax")}
          />
        )}
        {mode === "sax" && <SaxophoneLab onBack={() => setMode("tune")} />}
        {mode === "pulse" && <PulseView />}
        {mode === "analyze" && (
          // Placeholder: the live site has a built Analyze view, but its markup
          // was not recoverable from the saved page, so this is a stub rather
          // than an invented screen.
          <div className="content-wrap placeholder-view">
            <p className="eyebrow">Analyze · Alto saxophone</p>
            <h1>Not built yet.</h1>
            <p className="placeholder-lead">
              Analyze is part of the current navigation but has no view in this repository yet.
            </p>
            <div className="placeholder-panel compact"><div className="model-orbit"><Activity size={64} /></div></div>
          </div>
        )}
        {mode === "practice" && <PracticeView />}
      </main>

      <div className="mobile-dock">
        <div className="dock-side-button dock-left" aria-hidden="true"><LockKeyhole size={16} /></div>
        <button className="dock-side-button dock-right" aria-label="Open profile">TU</button>
        <nav className="mobile-nav is-arc" aria-label="Primary navigation">
          <svg className="arc-shape" viewBox="0 0 400 100" aria-hidden="true" focusable="false">
            <path d="M34 62 Q200 30 366 62" fill="none" stroke="#303035" strokeWidth="60" strokeLinecap="round" />
            <path d="M34 62 Q200 30 366 62" fill="none" stroke="rgba(16,16,18,0.97)" strokeWidth="58" strokeLinecap="round" />
            <path className="arc-active" d={ARC_PILLS[navItems.findIndex((item) => item.id === mode)]} />
          </svg>
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={mode === item.id ? "is-active" : ""}
                style={{ left: ARC_SEATS[index].left, top: ARC_SEATS[index].top, "--tilt": ARC_TILTS[index] } as React.CSSProperties}
                onClick={() => setMode(item.id)}
              >
                <Icon size={19} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function TunerView({
  reading,
  tracker,
  listening,
  micMessage,
  onListen,
  onReference,
  onOpenSax,
}: {
  reading: PitchReading | null;
  tracker: { level: number; confidence: number; accepted: number };
  listening: boolean;
  micMessage: string;
  onListen: () => void;
  onReference: () => void;
  onOpenSax: () => void;
}) {
  const inTune = reading !== null && Math.abs(reading.cents) <= 5;
  const direction = !reading ? "Ready" : reading.cents > 5 ? "Sharp" : reading.cents < -5 ? "Flat" : "Centered";
  const markerPosition = reading ? Math.max(4, Math.min(96, 50 + reading.cents * 0.8)) : 50;
  const concertNote = useMemo(() => {
    if (!reading) return null;
    const writtenMidi = (reading.octave + 1) * 12 + NOTE_NAMES.indexOf(reading.note);
    const concertMidi = writtenMidi - 9;
    return `${NOTE_NAMES[((concertMidi % 12) + 12) % 12]}${Math.floor(concertMidi / 12) - 1}`;
  }, [reading]);

  return (
    <div className="content-wrap tuner-layout">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Tune · Alto saxophone</p>
          <h1>Find the center.</h1>
          <p>Your written note is shown first. Bocal handles the E♭ transposition.</p>
        </div>
        <div className="live-badge"><span className={listening ? "pulse-dot" : "quiet-dot"} /> {listening ? "Listening" : "Ready"}</div>
      </section>

      <div className="tuner-grid">
        <section className={`tuner-card ${inTune ? "is-centered" : ""} ${reading ? "" : "is-waiting"}`} aria-live="polite">
          <div className="tuner-card-top">
            <span className="status-label"><CircleDot size={15} /> {direction}</span>
            <button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear concert C</button>
          </div>

          <div className="note-readout">
            {reading ? (
              <div className="note-name">{reading.note}<sup>{reading.octave}</sup></div>
            ) : (
              <div className="note-name is-empty">—</div>
            )}
            <div className="pitch-detail">
              {reading ? (
                <>
                  <span>{reading.cents > 0 ? "+" : ""}{reading.cents} cents</span>
                  <small>{reading.hz.toFixed(1)} Hz · sounds {concertNote}</small>
                </>
              ) : (
                <>
                  <span>Waiting for a stable tone</span>
                  <small>No note is shown until confidence passes the lock threshold</small>
                </>
              )}
            </div>
          </div>

          <div className="tune-scale" role="meter" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={reading?.cents ?? 0} aria-label="Pitch deviation in cents">
            <div className="scale-labels"><span>−50</span><span>−25</span><strong>0</strong><span>+25</span><span>+50</span></div>
            <div className="scale-track">
              <span className="center-zone" />
              <span className="scale-center" />
              {reading && <span className="pitch-marker" style={{ left: `${markerPosition}%` }}><i /></span>}
            </div>
            <div className="direction-row">
              <span>Flatten ↓</span>
              <strong>{!reading ? "Start the tuner" : inTune ? <><Check size={15} /> Tone locked</> : direction === "Sharp" ? "Relax the pitch" : "Support the air"}</strong>
              <span>Sharpen ↑</span>
            </div>
          </div>

          <div className="tracker-diagnostics" aria-label="Pitch lock diagnostics">
            <div>
              <span>Input</span>
              <i><b style={{ width: `${Math.round(tracker.level * 100)}%` }} /></i>
              <small>{tracker.level > 0.1 ? "Signal" : "Below gate"}</small>
            </div>
            <div><span>Confidence</span><strong>{tracker.confidence ? tracker.confidence.toFixed(2) : "—"}</strong></div>
            <div><span>Accepted</span><strong>{tracker.accepted}</strong></div>
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
            <h2>Play one steady note.</h2>
            <p>The display stays blank until Bocal hears a clear pitch.</p>
            <div className="mini-bars" aria-label="Accepted pitch-frame stability">
              {Array.from({ length: 18 }, (_, index) => (
                <i
                  key={index}
                  className={index < tracker.accepted * 6 ? "" : "is-empty"}
                  style={{ height: index < tracker.accepted * 6 ? `${40 + index * 3}%` : "8%" }}
                />
              ))}
            </div>
            <p className="lock-policy"><LockKeyhole size={13} /> Noise gate · 3-frame lock · 550 ms dropout hold</p>
          </article>

          <article className="sax-card" onClick={onOpenSax} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenSax()}>
            <div>
              <span className="card-kicker"><Rotate3D size={15} /> Fingering lab</span>
              <h3>Open the interactive alto sax.</h3>
              <p>Open the sax and the keys for this note will light up.</p>
            </div>
            <div className="sax-card-photo" aria-hidden="true" />
            <span className="round-arrow"><ArrowRight size={17} /></span>
          </article>
        </aside>
      </div>

      <section className="today-strip">
        <div className="today-title"><span>This session</span><strong>Your practice, as it happens.</strong></div>
        <Metric value="00:00" label="Practice timer" detail="start when ready" icon={TimerReset} />
        <Metric value={reading ? `${reading.cents > 0 ? "+" : ""}${reading.cents}¢` : "—"} label="Pitch offset" detail={reading ? "current lock" : "awaiting lock"} icon={Crosshair} />
        <Metric value={String(tracker.accepted)} label="Accepted frames" detail="this tuner run" icon={Activity} />
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
