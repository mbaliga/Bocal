"use client";

import {
  Activity,
  Archive,
  BellRing,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Download,
  Gauge,
  Headphones,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const DRONES = [
  { label: "Concert B♭", hz: 233.08 },
  { label: "Concert C", hz: 261.63 },
  { label: "Concert E♭", hz: 311.13 },
  { label: "Concert F", hz: 349.23 },
];

function audioClick(context: AudioContext, accent: boolean, subdivision: boolean) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = accent ? 1320 : subdivision ? 560 : 880;
  const now = context.currentTime;
  gain.gain.setValueAtTime(subdivision ? 0.045 : 0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (subdivision ? 0.035 : 0.055));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.07);
}

export function PulseView() {
  const [bpm, setBpm] = useState(92);
  const [playing, setPlaying] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [haptics, setHaptics] = useState(false);
  const [droneOn, setDroneOn] = useState(false);
  const [droneIndex, setDroneIndex] = useState(1);
  const contextRef = useRef<AudioContext | null>(null);
  const tickRef = useRef(0);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!playing) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    tickRef.current = 0;

    const tick = () => {
      const subTick = tickRef.current % subdivision;
      const beat = Math.floor(tickRef.current / subdivision) % beatsPerBar;
      const accent = beat === 0 && subTick === 0;
      audioClick(context, accent, subTick !== 0);
      if (subTick === 0) {
        setCurrentBeat(beat);
        if (haptics && navigator.vibrate) navigator.vibrate(accent ? 28 : 14);
      }
      tickRef.current += 1;
    };
    tick();
    const timer = window.setInterval(tick, 60000 / bpm / subdivision);
    return () => window.clearInterval(timer);
  }, [beatsPerBar, bpm, haptics, playing, subdivision]);

  useEffect(() => {
    if (!droneOn) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    const fundamental = context.createOscillator();
    const upper = context.createOscillator();
    const gain = context.createGain();
    const upperGain = context.createGain();
    fundamental.type = "sine";
    upper.type = "sine";
    fundamental.frequency.value = DRONES[droneIndex].hz;
    upper.frequency.value = DRONES[droneIndex].hz * 2;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.2);
    upperGain.gain.setValueAtTime(0.017, context.currentTime);
    fundamental.connect(gain).connect(context.destination);
    upper.connect(upperGain).connect(context.destination);
    fundamental.start(); upper.start();
    return () => {
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
      window.setTimeout(() => { fundamental.stop(); upper.stop(); }, 90);
    };
  }, [droneIndex, droneOn]);

  const tapTempo = () => {
    const now = performance.now();
    const recent = [...tapsRef.current.filter((tap) => now - tap < 2400), now].slice(-5);
    tapsRef.current = recent;
    if (recent.length > 1) {
      const intervals = recent.slice(1).map((tap, index) => tap - recent[index]);
      const next = Math.round(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
      if (next >= 35 && next <= 260) setBpm(next);
    }
  };

  const tempoName = bpm < 60 ? "Largo" : bpm < 76 ? "Adagio" : bpm < 108 ? "Andante" : bpm < 120 ? "Moderato" : bpm < 168 ? "Allegro" : "Presto";

  return (
    <div className="content-wrap pulse-view">
      <section className="section-heading">
        <div><p className="eyebrow">Pulse · Metronome</p><h1>Time, without friction.</h1><p>One surface for tempo, feel, subdivision, and a tuning drone.</p></div>
        <div className={`live-badge ${playing ? "metronome-live" : ""}`}><span className={playing ? "pulse-dot" : "quiet-dot"} /> {playing ? "In motion" : "Ready"}</div>
      </section>

      <div className="pulse-grid">
        <section className="metronome-card">
          <div className="metronome-top"><span><Waves size={15} /> {tempoName}</span><button onClick={() => { setBpm(92); setSubdivision(1); setBeatsPerBar(4); }}><RotateCcw size={14} /> Reset</button></div>
          <div className="tempo-readout"><button onClick={() => setBpm((value) => Math.max(35, value - 1))}><Minus size={21} /></button><div><strong>{bpm}</strong><span>BPM</span></div><button onClick={() => setBpm((value) => Math.min(260, value + 1))}><Plus size={21} /></button></div>
          <input className="tempo-slider" type="range" min="35" max="220" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} aria-label="Tempo" />
          <div className="beat-lights" aria-label={`Beat ${currentBeat + 1} of ${beatsPerBar}`}>
            {Array.from({ length: beatsPerBar }, (_, index) => <i key={index} className={playing && currentBeat === index ? "is-active" : ""}><span>{index + 1}</span></i>)}
          </div>
          <div className="pulse-primary-actions"><button className="tap-button" onClick={tapTempo}>Tap tempo</button><button className={`play-pulse ${playing ? "is-playing" : ""}`} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}{playing ? "Pause" : "Start"}</button></div>
        </section>

        <aside className="pulse-controls">
          <article className="control-card"><div className="control-head"><span><Activity size={15} /> Meter</span><button>4/4 <ChevronDown size={13} /></button></div><div className="choice-row meter-choices">{[3,4,5,6].map((count) => <button key={count} className={beatsPerBar === count ? "is-active" : ""} onClick={() => setBeatsPerBar(count)}>{count}<small>/4</small></button>)}</div></article>
          <article className="control-card"><div className="control-head"><span><Zap size={15} /> Subdivision</span><small>{subdivision === 1 ? "Quarter" : subdivision === 2 ? "Eighth" : "Sixteenth"}</small></div><div className="choice-row subdivision-choices">{[{v:1,l:"♩"},{v:2,l:"♫"},{v:4,l:"♬"}].map((item) => <button key={item.v} className={subdivision === item.v ? "is-active" : ""} onClick={() => setSubdivision(item.v)}>{item.l}</button>)}</div></article>
          <article className="control-card haptic-control"><div><span><BellRing size={15} /> Feel the beat</span><p>A tactile pulse keeps your eyes on the music.</p></div><button className={`toggle ${haptics ? "is-on" : ""}`} onClick={() => setHaptics((value) => !value)} aria-pressed={haptics}><i /></button></article>
        </aside>
      </div>

      <section className="drone-strip">
        <div><span className="drone-icon"><Headphones size={18} /></span><div><strong>Harmony drone</strong><small>Hear the tonal center beneath the click.</small></div></div>
        <div className="drone-controls"><select value={droneIndex} onChange={(event) => setDroneIndex(Number(event.target.value))} aria-label="Drone note">{DRONES.map((drone, index) => <option value={index} key={drone.label}>{drone.label}</option>)}</select><button className={droneOn ? "is-on" : ""} onClick={() => setDroneOn((value) => !value)}>{droneOn ? <Pause size={15} /> : <Volume2 size={15} />}{droneOn ? "Stop drone" : "Play drone"}</button></div>
      </section>
    </div>
  );
}

type SessionRecord = { date: string; seconds: number; note?: string };

const WEEK = [
  { day: "M", minutes: 12 }, { day: "T", minutes: 18 }, { day: "W", minutes: 0 },
  { day: "T", minutes: 23 }, { day: "F", minutes: 9 }, { day: "S", minutes: 16 }, { day: "S", minutes: 0 },
];

export function PracticeView() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setSessions(JSON.parse(localStorage.getItem("bocal-sessions") ?? "[]"));
        setSavedNote(localStorage.getItem("bocal-lesson-note") ?? "");
      } catch { /* Local storage can be unavailable in private browsing. */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const totalMinutes = useMemo(() => WEEK.reduce((sum, day) => sum + day.minutes, 0) + Math.round(sessions.reduce((sum, session) => sum + session.seconds, 0) / 60), [sessions]);
  const saveNote = () => {
    const clean = note.trim();
    if (!clean) return;
    setSavedNote(clean);
    setNote("");
    try { localStorage.setItem("bocal-lesson-note", clean); } catch { /* Non-critical local enhancement. */ }
  };
  const exportData = () => {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), sessions, lessonNote: savedNote, completed };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bocal-practice-data.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const toggleComplete = (id: string) => setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="content-wrap practice-view">
      <section className="section-heading practice-heading">
        <div><p className="eyebrow">Practice · Your studio</p><h1>A plan worth returning to.</h1><p>Useful direction, honest progress, and no guilt mechanics.</p></div>
        <button className="button secondary export-button" onClick={exportData}><Download size={15} /> Export my data</button>
      </section>

      <div className="practice-overview">
        <section className="focus-plan">
          <div className="practice-card-head"><div><span className="card-kicker"><Sparkles size={14} /> Today · 15 minutes</span><h2>Your next focused set</h2></div><span className="plan-progress">{completed.length}/3</span></div>
          <PracticeItem id="tone" title="Long-tone center" detail="A4 · 60 seconds × 3" time="4 min" active done={completed.includes("tone")} onToggle={toggleComplete} />
          <PracticeItem id="scale" title="G major, full range" detail="Tongued → slurred · 72 BPM" time="5 min" done={completed.includes("scale")} onToggle={toggleComplete} />
          <PracticeItem id="piece" title="Autumn Leaves" detail="Bars 9–16 · intonation pass" time="6 min" done={completed.includes("piece")} onToggle={toggleComplete} />
        </section>

        <section className="week-card">
          <div className="practice-card-head"><div><span className="card-kicker"><Activity size={14} /> This week</span><h2>{totalMinutes} focused minutes</h2></div><span className="trend-chip">+18%</span></div>
          <div className="week-chart">{WEEK.map((item, index) => <div key={index}><i style={{ height: `${Math.max(4, item.minutes / 24 * 100)}%` }} className={item.minutes === 0 ? "is-empty" : ""} /><span>{item.day}</span></div>)}</div>
          <div className="week-summary"><span><strong>4</strong> days played</span><span><strong>±7¢</strong> typical stability</span></div>
        </section>
      </div>

      <div className="practice-lower-grid">
        <section className="repertoire-card">
          <div className="list-card-head"><div><span className="card-kicker"><Music2 size={14} /> Repertoire</span><h2>In the shed</h2></div><button aria-label="Add piece"><Plus size={17} /></button></div>
          <RepertoireRow title="Autumn Leaves" meta="Joseph Kosma · E minor" progress={72} status="Working" />
          <RepertoireRow title="Blue Monk" meta="Thelonious Monk · B♭ blues" progress={44} status="Learning" />
          <RepertoireRow title="Ain't No Sunshine" meta="Bill Withers · transcription" progress={18} status="Queued" />
        </section>

        <section className="lesson-card">
          <div className="list-card-head"><div><span className="card-kicker"><BookOpen size={14} /> Lesson log</span><h2>Keep the useful bit</h2></div><span className="local-chip"><Archive size={12} /> Local</span></div>
          {savedNote && <blockquote>{savedNote}</blockquote>}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should future-you remember?" aria-label="Lesson note" />
          <button className="save-note" onClick={saveNote} disabled={!note.trim()}><Save size={15} /> Save note</button>
        </section>

        <section className="equipment-card">
          <div className="list-card-head"><div><span className="card-kicker"><Gauge size={14} /> Equipment</span><h2>Your current setup</h2></div><button aria-label="Equipment options"><ChevronDown size={16} /></button></div>
          <div className="setup-row"><span className="setup-art">2½</span><div><strong>Vandoren Traditional</strong><span>Reed 3 · 8 days in rotation</span></div><i>Healthy</i></div>
          <div className="setup-row"><span className="setup-art mouthpiece">4C</span><div><strong>Yamaha 4C</strong><span>Mouthpiece · primary</span></div><i>Active</i></div>
          <p className="equipment-note"><CircleDot size={12} /> Rotate Reed 3 out after two more sessions.</p>
        </section>
      </div>
    </div>
  );
}

function PracticeItem({ id, title, detail, time, done, active, onToggle }: { id: string; title: string; detail: string; time: string; done: boolean; active?: boolean; onToggle: (id: string) => void }) {
  return <button className={`practice-item ${active ? "is-active" : ""} ${done ? "is-done" : ""}`} onClick={() => onToggle(id)}><span className="complete-dot">{done ? <Check size={14} /> : active ? <Play size={12} fill="currentColor" /> : null}</span><div><strong>{title}</strong><span>{detail}</span></div><small><Clock3 size={12} /> {time}</small></button>;
}

function RepertoireRow({ title, meta, progress, status }: { title: string; meta: string; progress: number; status: string }) {
  return <div className="repertoire-row"><span className="album-tile"><Music2 size={17} /></span><div><strong>{title}</strong><small>{meta}</small><span className="repertoire-progress"><i style={{ width: `${progress}%` }} /></span></div><em>{status}</em></div>;
}
