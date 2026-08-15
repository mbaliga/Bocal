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

type Mode = "tune" | "sax" | "pulse" | "practice";

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
  if (rms < 0.012) return -1;

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

  return bestOffset > 0 && bestCorrelation > 0.92 ? sampleRate / bestOffset : -1;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const navItems: { id: Mode; label: string; icon: typeof Crosshair }[] = [
  { id: "tune", label: "Tune", icon: Crosshair },
  { id: "sax", label: "Sax lab", icon: Wind },
  { id: "pulse", label: "Pulse", icon: Waves },
  { id: "practice", label: "Practice", icon: Music2 },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("tune");
  const [reading, setReading] = useState<PitchReading>({
    hz: 261.1,
    note: "A",
    octave: 4,
    cents: -3,
  });
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

      const sample = () => {
        analyser.getFloatTimeDomainData(data);
        const detected = autoCorrelate(data, audioContext.sampleRate);
        if (detected > 0) setReading(pitchFromFrequency(detected));
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
    <div className="app-shell">
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
          <button className="instrument-picker" aria-label="Choose instrument">
            <span className="instrument-icon"><Wind size={18} /></span>
            <span><small>Instrument</small>Alto sax · E♭</span>
            <ChevronDown size={16} />
          </button>
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
            listening={listening}
            micMessage={micMessage}
            onListen={startListening}
            onReference={playReferenceTone}
            onOpenSax={() => setMode("sax")}
          />
        )}
        {mode === "sax" && <SaxophoneLab onBack={() => setMode("tune")} />}
        {mode === "pulse" && <PulseView />}
        {mode === "practice" && <PracticeView />}
      </main>

      <div className="mobile-dock">
        <div className="dock-side-button" aria-hidden="true"><LockKeyhole size={16} /></div>
        <nav className="mobile-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={mode === item.id ? "is-active" : ""} onClick={() => setMode(item.id)}>
                <Icon size={19} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="dock-side-button" aria-label="Open profile">TU</button>
      </div>
    </div>
  );
}

function TunerView({
  reading,
  listening,
  micMessage,
  onListen,
  onReference,
  onOpenSax,
}: {
  reading: PitchReading;
  listening: boolean;
  micMessage: string;
  onListen: () => void;
  onReference: () => void;
  onOpenSax: () => void;
}) {
  const inTune = Math.abs(reading.cents) <= 5;
  const direction = reading.cents > 5 ? "Sharp" : reading.cents < -5 ? "Flat" : "Centered";
  const markerPosition = Math.max(4, Math.min(96, 50 + reading.cents * 0.8));
  const concertNote = useMemo(() => {
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
        <section className={`tuner-card ${inTune ? "is-centered" : ""}`} aria-live="polite">
          <div className="tuner-card-top">
            <span className="status-label"><CircleDot size={15} /> {direction}</span>
            <button className="small-action" onClick={onReference}><Volume2 size={16} /> Hear concert C</button>
          </div>

          <div className="note-readout">
            <div className="note-name">{reading.note}<sup>{reading.octave}</sup></div>
            <div className="pitch-detail">
              <span>{reading.cents > 0 ? "+" : ""}{reading.cents} cents</span>
              <small>{reading.hz.toFixed(1)} Hz · sounds {concertNote}</small>
            </div>
          </div>

          <div className="tune-scale" role="meter" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={reading.cents}>
            <div className="scale-labels"><span>−50</span><span>−25</span><strong>0</strong><span>+25</span><span>+50</span></div>
            <div className="scale-track">
              <span className="center-zone" />
              <span className="scale-center" />
              <span className="pitch-marker" style={{ left: `${markerPosition}%` }}><i /></span>
            </div>
            <div className="direction-row"><span>Flatten ↓</span><strong>{inTune ? <><Check size={15} /> Tone locked</> : direction === "Sharp" ? "Relax the pitch" : "Support the air"}</strong><span>Sharpen ↑</span></div>
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
            <div className="card-kicker"><Sparkles size={15} /> Next best action</div>
            <h2>Settle your long-tone A.</h2>
            <p>You tend to arrive slightly flat, then center within 1.8 seconds. Use a softer attack and keep the air moving.</p>
            <div className="mini-bars" aria-label="Recent pitch stability">
              {[48, 61, 56, 72, 69, 84, 78, 91, 88, 93, 95, 92].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
            <button className="text-button">Start 60-second hold <ArrowRight size={15} /></button>
          </article>

          <article className="sax-card" onClick={onOpenSax} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenSax()}>
            <div>
              <span className="card-kicker"><Rotate3D size={15} /> Fingering lab</span>
              <h3>See A on the sax.</h3>
              <p>Explore the instrument and learn which keys make every note.</p>
            </div>
            <div className="sax-silhouette" aria-hidden="true"><span /><i /><b /></div>
            <span className="round-arrow"><ArrowRight size={17} /></span>
          </article>
        </aside>
      </div>

      <section className="today-strip">
        <div className="today-title"><span>Today</span><strong>Small wins, clearly seen.</strong></div>
        <Metric value="08:42" label="Focused minutes" detail="of 15 min goal" icon={TimerReset} />
        <Metric value="±7¢" label="Pitch stability" detail="2¢ tighter this week" icon={Crosshair} />
        <Metric value="4" label="Practice days" detail="never miss twice" icon={Activity} />
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
