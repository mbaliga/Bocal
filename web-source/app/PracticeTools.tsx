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
import {
  calculateSkillRating,
  emptySkillEvidence,
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  type SkillEvidenceBundle,
  withRhythmAttempt,
} from "./skill-rating";

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
  const lastBeatAtRef = useRef<number | null>(null);
  const rhythmErrorsRef = useRef<number[]>([]);
  const [rhythmTapCount, setRhythmTapCount] = useState(0);
  const [rhythmFeedback, setRhythmFeedback] = useState("");

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
        lastBeatAtRef.current = performance.now();
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

  const tapWithPulse = () => {
    const lastBeat = lastBeatAtRef.current;
    if (lastBeat === null) return;
    const beatDuration = 60_000 / bpm;
    const elapsed = performance.now() - lastBeat;
    const phase = ((elapsed % beatDuration) + beatDuration) % beatDuration;
    const error = Math.min(phase, beatDuration - phase);
    const nextErrors = [...rhythmErrorsRef.current, error].slice(-16);
    rhythmErrorsRef.current = nextErrors;
    setRhythmTapCount(nextErrors.length);
    if (nextErrors.length < 16) return;

    const ordered = [...nextErrors].sort((left, right) => left - right);
    const medianError = (ordered[7] + ordered[8]) / 2;
    try {
      const capturedAt = new Date().toISOString();
      const current = parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY));
      const next = withRhythmAttempt(current, {
        id: `rhythm-${capturedAt}`,
        capturedAt,
        hitCount: 16,
        medianAbsoluteErrorMs: Number(medianError.toFixed(2)),
      });
      localStorage.setItem(SKILL_EVIDENCE_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("bocal-skill-evidence"));
      setRhythmFeedback(`Saved 16 attacks · ${Math.round(medianError)} ms median timing error.`);
    } catch {
      setRhythmFeedback(`Measured ${Math.round(medianError)} ms median timing error; device storage is unavailable.`);
    }
    rhythmErrorsRef.current = [];
    setRhythmTapCount(0);
  };

  const handleTap = () => playing ? tapWithPulse() : tapTempo();
  const togglePlaying = () => {
    if (!playing) {
      rhythmErrorsRef.current = [];
      setRhythmTapCount(0);
      setRhythmFeedback("Tap with the pulse 16 times to add measured rhythm evidence.");
    } else {
      lastBeatAtRef.current = null;
    }
    setPlaying((value) => !value);
  };

  const tempoName = bpm < 60 ? "Largo" : bpm < 76 ? "Adagio" : bpm < 108 ? "Andante" : bpm < 120 ? "Moderato" : bpm < 168 ? "Allegro" : "Presto";

  return (
    <div className="content-wrap pulse-view">
      <section className="section-heading">
        <div><p className="eyebrow">Pulse · Metronome</p><h1>Set the pulse.</h1><p>Adjust the tempo, meter and subdivision, or add a tuning drone underneath.</p></div>
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
          <div className="pulse-primary-actions"><button className={`tap-button ${playing ? "is-assessing" : ""}`} onClick={handleTap}>{playing ? `Tap with pulse · ${rhythmTapCount}/16` : "Tap tempo"}</button><button className={`play-pulse ${playing ? "is-playing" : ""}`} onClick={togglePlaying}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}{playing ? "Pause" : "Start"}</button></div>
          {rhythmFeedback && <p className="rhythm-feedback"><Activity size={13} /> {rhythmFeedback}</p>}
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

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekFromSessions(sessions: SessionRecord[]) {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index), 12);
    const key = dayKey(date);
    const seconds = sessions.reduce((sum, session) => {
      const captured = new Date(session.date);
      return Number.isFinite(captured.getTime()) && dayKey(captured) === key ? sum + Math.max(0, session.seconds) : sum;
    }, 0);
    return { key, day: date.toLocaleDateString(undefined, { weekday: "narrow" }), minutes: Math.round(seconds / 60) };
  });
}

export function PracticeView({
  onOpenTuner,
  onOpenSax,
  onOpenPulse,
}: {
  onOpenTuner: () => void;
  onOpenSax: () => void;
  onOpenPulse: () => void;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [skillEvidence, setSkillEvidence] = useState<SkillEvidenceBundle>(() => emptySkillEvidence());

  useEffect(() => {
    const restore = () => {
      try {
        setSessions(JSON.parse(localStorage.getItem("bocal-sessions") ?? "[]"));
        setSavedNote(localStorage.getItem("bocal-lesson-note") ?? "");
        setSkillEvidence(parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY)));
      } catch { /* Local storage can be unavailable in private browsing. */ }
    };
    const restoreTimer = window.setTimeout(restore, 0);
    window.addEventListener("bocal-skill-evidence", restore);
    window.addEventListener("storage", restore);
    return () => {
      window.clearTimeout(restoreTimer);
      window.removeEventListener("bocal-skill-evidence", restore);
      window.removeEventListener("storage", restore);
    };
  }, []);

  const week = useMemo(() => weekFromSessions(sessions), [sessions]);
  const totalMinutes = useMemo(() => week.reduce((sum, day) => sum + day.minutes, 0), [week]);
  const daysPlayed = useMemo(() => week.filter((day) => day.minutes > 0).length, [week]);
  const skillRating = useMemo(() => calculateSkillRating(skillEvidence), [skillEvidence]);
  const saveNote = () => {
    const clean = note.trim();
    if (!clean) return;
    setSavedNote(clean);
    setNote("");
    try { localStorage.setItem("bocal-lesson-note", clean); } catch { /* Non-critical local enhancement. */ }
  };
  const exportData = () => {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), sessions, lessonNote: savedNote, completed, skillEvidence, skillRating };
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
        <div><p className="eyebrow">Practice · Your studio</p><h1>Plan your next session.</h1><p>Pick a short set, keep the notes that matter, and see what you actually practised.</p></div>
        <button className="button secondary export-button" onClick={exportData}><Download size={15} /> Export my data</button>
      </section>

      <SkillRatingCard
        rating={skillRating}
        onOpenTuner={onOpenTuner}
        onOpenSax={onOpenSax}
        onOpenPulse={onOpenPulse}
      />

      <div className="practice-overview">
        <section className="focus-plan">
          <div className="practice-card-head"><div><span className="card-kicker"><Sparkles size={14} /> Today · 15 minutes</span><h2>Your next focused set</h2></div><span className="plan-progress">{completed.length}/3</span></div>
          <PracticeItem id="tone" title="Long-tone center" detail="A4 · 60 seconds × 3" time="4 min" active done={completed.includes("tone")} onToggle={toggleComplete} />
          <PracticeItem id="scale" title="G major, full range" detail="Tongued → slurred · 72 BPM" time="5 min" done={completed.includes("scale")} onToggle={toggleComplete} />
          <PracticeItem id="piece" title="Autumn Leaves" detail="Bars 9–16 · intonation pass" time="6 min" done={completed.includes("piece")} onToggle={toggleComplete} />
        </section>

        <section className="week-card">
          <div className="practice-card-head"><div><span className="card-kicker"><Activity size={14} /> Last seven days</span><h2>{totalMinutes} focused minutes</h2></div><span className="trend-chip">Device data</span></div>
          <div className="week-chart">{week.map((item) => <div key={item.key}><i style={{ height: `${Math.max(4, item.minutes / Math.max(24, ...week.map((day) => day.minutes)) * 100)}%` }} className={item.minutes === 0 ? "is-empty" : ""} /><span>{item.day}</span></div>)}</div>
          <div className="week-summary"><span><strong>{daysPlayed}</strong> days played</span><span><strong>{skillRating.evidence.acceptedPitchFrames}</strong> accepted pitch frames</span></div>
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

function SkillRatingCard({
  rating,
  onOpenTuner,
  onOpenSax,
  onOpenPulse,
}: {
  rating: ReturnType<typeof calculateSkillRating>;
  onOpenTuner: () => void;
  onOpenSax: () => void;
  onOpenPulse: () => void;
}) {
  const statusLabel = rating.status === "unrated" ? "Unrated" : rating.status === "provisional" ? "Provisional" : "Established";
  return (
    <section className="skill-rating-card">
      <header>
        <div><span className="card-kicker"><Gauge size={14} /> Bocal skill rating · {rating.formulaVersion}</span><h2>Your score, explained.</h2><p>Bocal scores only the work recorded on this device. Open the details to see the formula and what is still missing. It does not try to judge expression, tone colour, sight-reading or repertoire.</p></div>
        <span className={`rating-status is-${rating.status}`}>{statusLabel}</span>
      </header>

      <div className="rating-overview">
        <div className="rating-number"><strong>{rating.rating ?? "—"}</strong><span>{rating.level} benchmark</span><small>{rating.rating === null ? "A provisional score starts after 75 accepted pitch frames" : `${rating.confidence}% data coverage`}</small></div>
        <div className="rating-confidence">
          <div><span>Evidence coverage</span><strong>{rating.confidence}%</strong></div>
          <i><b style={{ width: `${rating.confidence}%` }} /></i>
          <p>This shows how much practice data the score is based on. More coverage makes the score better supported; it does not add bonus points.</p>
        </div>
        <div className="rating-evidence">
          <span><strong>{rating.evidence.tunerSessions}</strong> tuner sessions</span>
          <span><strong>{rating.evidence.acceptedPitchFrames}</strong> pitch frames</span>
          <span><strong>{rating.evidence.fingeringAttempts}</strong> fingering checks</span>
          <span><strong>{rating.evidence.rhythmHits}</strong> rhythm attacks</span>
          <span><strong>{rating.evidence.distinctNotes}</strong> distinct notes</span>
        </div>
      </div>

      <div className="rating-dimensions">
        {rating.dimensions.map((dimension) => (
          <article key={dimension.id}>
            <div><span>{dimension.label} · {Math.round(dimension.weight * 100)}%</span><strong>{dimension.score ?? "—"}</strong></div>
            <i><b style={{ width: `${dimension.score ?? 0}%` }} /></i>
            <small>{dimension.evidence}</small>
          </article>
        ))}
      </div>

      <div className="rating-actions">
        <button onClick={onOpenTuner}><Headphones size={15} /> Measure pitch</button>
        <button onClick={onOpenSax}><Music2 size={15} /> Test fingering</button>
        <button onClick={onOpenPulse}><Waves size={15} /> Measure rhythm</button>
      </div>

      <details className="rating-formula">
        <summary>Show the exact scoring rules</summary>
        <p><strong>Rating = 400 + 16 × measured weighted score.</strong> Bocal leaves a category out until there is enough data for it. The categories that do have enough data are reweighted for a provisional score.</p>
        <ul>{rating.dimensions.map((dimension) => <li key={dimension.id}><span>{dimension.label}</span><code>{dimension.formula}</code></li>)}</ul>
        <p>A score becomes established after 3 tuner sessions, 600 accepted frames, 30 fingering checks, 64 rhythm attacks and 18 different notes. The same saved data always produces the same result. These are Bocal benchmarks, not a ranking against other players.</p>
      </details>
    </section>
  );
}

function PracticeItem({ id, title, detail, time, done, active, onToggle }: { id: string; title: string; detail: string; time: string; done: boolean; active?: boolean; onToggle: (id: string) => void }) {
  return <button className={`practice-item ${active ? "is-active" : ""} ${done ? "is-done" : ""}`} onClick={() => onToggle(id)}><span className="complete-dot">{done ? <Check size={14} /> : active ? <Play size={12} fill="currentColor" /> : null}</span><div><strong>{title}</strong><span>{detail}</span></div><small><Clock3 size={12} /> {time}</small></button>;
}

function RepertoireRow({ title, meta, progress, status }: { title: string; meta: string; progress: number; status: string }) {
  return <div className="repertoire-row"><span className="album-tile"><Music2 size={17} /></span><div><strong>{title}</strong><small>{meta}</small><span className="repertoire-progress"><i style={{ width: `${progress}%` }} /></span></div><em>{status}</em></div>;
}
