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
  Gauge,
  Headphones,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { addSongWish, parsePracticeActivities, parseSongWishlist, PRACTICE_ACTIVITY_STORAGE_KEY, recordPracticeActivity, SONG_WISHLIST_STORAGE_KEY, type PracticeActivity, type PracticeActivityType, type SongWish } from "./practice-data";
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

const ACTIVITY_LABELS: Record<PracticeActivityType, string> = {
  tuning: "Tune",
  fingering: "Fingering",
  rhythm: "Pulse",
  chords: "Chords",
  analysis: "Analysis",
  repertoire: "Repertoire",
  session: "General",
};

const ACTIVITY_COLORS: Record<PracticeActivityType, string> = {
  tuning: "#08fed5",
  fingering: "#a28fff",
  rhythm: "#ffbf62",
  chords: "#ff7d91",
  analysis: "#82a8ff",
  repertoire: "#8fd48d",
  session: "#8f8f93",
};


function audioClick(context: AudioContext, accent: boolean, subdivision: boolean, when: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = accent ? 1320 : subdivision ? 560 : 880;
  gain.gain.setValueAtTime(subdivision ? 0.045 : 0.1, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (subdivision ? 0.035 : 0.055));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(when);
  oscillator.stop(when + 0.07);
}

/** How far ahead of the audio clock clicks are queued. */
const SCHEDULE_AHEAD = 0.12;
/** How often the scheduler wakes to top up the queue. */
const SCHEDULER_TICK_MS = 25;

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
  /** Audio-clock time of tick 0 for the current run; null when stopped. */
  const startAudioTimeRef = useRef<number | null>(null);
  const hapticsRef = useRef(false);
  const rhythmErrorsRef = useRef<number[]>([]);
  const [rhythmTapCount, setRhythmTapCount] = useState(0);
  const [rhythmFeedback, setRhythmFeedback] = useState("");

  useEffect(() => {
    if (!playing) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    tickRef.current = 0;

    // The metronome runs on the audio clock, not on setInterval. A timer
    // callback is only accurate to a handful of milliseconds and drifts
    // steadily under load, in a background tab, or on a throttled phone --
    // which is exactly the tool a player is using to judge whether *they* are
    // drifting. Instead the scheduler wakes often, queues every click due in
    // the next fraction of a second at an exact audio-clock time, and the
    // audio hardware plays them on the sample. Only the on-screen beat dot
    // and the haptic pulse ride a plain timer, where a few milliseconds of
    // jitter is invisible.
    const secondsPerTick = 60 / bpm / subdivision;
    const startTime = context.currentTime + 0.06;
    startAudioTimeRef.current = startTime;
    const visualTimers: number[] = [];

    const schedule = () => {
      while (startTime + tickRef.current * secondsPerTick < context.currentTime + SCHEDULE_AHEAD) {
        const index = tickRef.current;
        const when = startTime + index * secondsPerTick;
        const subTick = index % subdivision;
        const beat = Math.floor(index / subdivision) % beatsPerBar;
        const accent = beat === 0 && subTick === 0;
        audioClick(context, accent, subTick !== 0, when);
        if (subTick === 0) {
          visualTimers.push(
            window.setTimeout(
              () => {
                setCurrentBeat(beat);
                if (hapticsRef.current && navigator.vibrate) navigator.vibrate(accent ? 28 : 14);
              },
              Math.max(0, (when - context.currentTime) * 1000),
            ),
          );
        }
        tickRef.current += 1;
      }
    };

    schedule();
    const timer = window.setInterval(schedule, SCHEDULER_TICK_MS);
    return () => {
      window.clearInterval(timer);
      visualTimers.forEach(window.clearTimeout);
      startAudioTimeRef.current = null;
    };
  }, [beatsPerBar, bpm, playing, subdivision]);

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

  // Toggling haptics must not restart the click scheduler, so the flag is read
  // through a ref rather than captured in the effect's dependency list.
  useEffect(() => { hapticsRef.current = haptics; }, [haptics]);

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
    // Measured against the audio clock the clicks were scheduled on, not
    // against when the screen last updated. Grading someone's timing on a
    // clock looser than the error being measured would invent most of the
    // number. Phase is taken from the run's start time, so it stays exact
    // however long the metronome has been going.
    const context = contextRef.current;
    const startTime = startAudioTimeRef.current;
    if (!context || startTime === null) return;
    const beatDuration = 60_000 / bpm;
    const elapsed = (context.currentTime - startTime) * 1000;
    if (elapsed < 0) return;
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
      recordPracticeActivity({ type: "rhythm", seconds: (60 / bpm) * 16, label: "Pulse accuracy" });
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
      startAudioTimeRef.current = null;
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
  const [shareMessage, setShareMessage] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activities, setActivities] = useState<PracticeActivity[]>([]);
  const [songWishes, setSongWishes] = useState<SongWish[]>([]);
  const [songTitle, setSongTitle] = useState("");
  const [skillEvidence, setSkillEvidence] = useState<SkillEvidenceBundle>(() => emptySkillEvidence());

  useEffect(() => {
    const restore = () => {
      try {
        setSessions(JSON.parse(localStorage.getItem("bocal-sessions") ?? "[]"));
        setActivities(parsePracticeActivities(localStorage.getItem(PRACTICE_ACTIVITY_STORAGE_KEY)));
        setSongWishes(parseSongWishlist(localStorage.getItem(SONG_WISHLIST_STORAGE_KEY)));
        setSavedNote(localStorage.getItem("bocal-lesson-note") ?? "");
        setSkillEvidence(parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY)));
      } catch { /* Local storage can be unavailable in private browsing. */ }
    };
    const restoreTimer = window.setTimeout(restore, 0);
    window.addEventListener("bocal-skill-evidence", restore);
    window.addEventListener("bocal-practice-activity", restore);
    window.addEventListener("bocal-song-wishlist", restore);
    window.addEventListener("storage", restore);
    return () => {
      window.clearTimeout(restoreTimer);
      window.removeEventListener("bocal-skill-evidence", restore);
      window.removeEventListener("bocal-practice-activity", restore);
      window.removeEventListener("bocal-song-wishlist", restore);
      window.removeEventListener("storage", restore);
    };
  }, []);

  const week = useMemo(() => weekFromSessions(sessions), [sessions]);
  const totalMinutes = useMemo(() => week.reduce((sum, day) => sum + day.minutes, 0), [week]);
  const daysPlayed = useMemo(() => week.filter((day) => day.minutes > 0).length, [week]);
  const skillRating = useMemo(() => calculateSkillRating(skillEvidence), [skillEvidence]);
  const activityWeek = useMemo(() => week.map((day) => ({
    ...day,
    seconds: activities.filter((activity) => activityDayKey(activity) === day.key).reduce((sum, activity) => sum + activity.seconds, 0),
  })), [activities, week]);
  const activitiesByType = useMemo(() => (Object.keys(ACTIVITY_LABELS) as PracticeActivityType[])
    .map((type) => ({ type, seconds: activities.filter((activity) => activity.type === type).reduce((sum, activity) => sum + activity.seconds, 0) }))
    .filter((item) => item.seconds > 0), [activities]);
  const notes = useMemo(() => Object.entries(activities.flatMap((activity) => activity.notes ?? []).reduce<Record<string, number>>((counts, noteName) => {
    counts[noteName] = (counts[noteName] ?? 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]).slice(0, 6), [activities]);
  const activeDays = useMemo(() => activityWeek.filter((day) => day.seconds > 0).length, [activityWeek]);
  const saveNote = () => {
    const clean = note.trim();
    if (!clean) return;
    setSavedNote(clean);
    setNote("");
    try { localStorage.setItem("bocal-lesson-note", clean); } catch { /* Non-critical local enhancement. */ }
  };
  const exportData = () => {
    const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), sessions, activities, songWishes, lessonNote: savedNote, completed, skillEvidence, skillRating };
    const json = JSON.stringify(payload, null, 2);
    const file = new File([json], "bocal-practice-data.json", { type: "application/json" });
    // A short human-readable line rides along with the file. What the player
    // usually wants is to send this to a teacher, and a teacher opening a
    // message that is only a JSON attachment learns nothing from the preview.
    const summary =
      `Bocal practice export · ${totalMinutes} focused minutes over ${daysPlayed} ` +
      `${daysPlayed === 1 ? "day" : "days"} in the last week · ` +
      `${skillRating.evidence.acceptedPitchFrames} accepted pitch frames.`;

    const download = () => {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setShareMessage("Saved to your downloads.");
    };

    // Prefer the OS sharesheet. On a phone "export" nearly always means "send
    // this to someone", and a download drops the file into a folder the player
    // then has to go and find. canShare is synchronous, so the click gesture
    // that permits share() is still live when we call it.
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      navigator
        .share({ files: [file], title: "Bocal practice data", text: summary })
        .then(() => setShareMessage("Shared."))
        .catch((error: unknown) => {
          // Dismissing the sheet is a decision, not a failure. Anything else
          // falls back to a download so the data is never trapped in the app.
          if (error instanceof DOMException && error.name === "AbortError") return;
          download();
        });
      return;
    }
    download();
  };
  const addWish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!songTitle.trim()) return;
    addSongWish(songTitle);
    setSongTitle("");
  };
  const chordFlowProgress = Math.min(100, activities.filter((activity) => activity.type === "chords").length * 25);
  const toggleComplete = (id: string) => setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="content-wrap practice-view">
      <section className="section-heading practice-heading">
        <div><p className="eyebrow">Practice · Your studio</p><h1>Plan your next session.</h1><p>Pick a short set, keep the notes that matter, and see what you actually practised.</p></div>
        <div className="export-stack">
          <button className="button secondary export-button" onClick={exportData}>
            <Share2 size={15} /> Share my progress
          </button>
          {shareMessage && <small className="export-status" role="status">{shareMessage}</small>}
        </div>
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
          <PracticeItem id="piece" title="Phrase craft" detail="Your own chart · a clean, small section" time="6 min" done={completed.includes("piece")} onToggle={toggleComplete} />
        </section>

        <section className="week-card">
          <div className="practice-card-head"><div><span className="card-kicker"><Activity size={14} /> Last seven days</span><h2>{totalMinutes} focused minutes</h2></div><span className="trend-chip">Device data</span></div>
          <div className="week-chart">{week.map((item) => <div key={item.key}><i style={{ height: `${Math.max(4, item.minutes / Math.max(24, ...week.map((day) => day.minutes)) * 100)}%` }} className={item.minutes === 0 ? "is-empty" : ""} /><span>{item.day}</span></div>)}</div>
          <div className="week-summary"><span><strong>{daysPlayed}</strong> days played</span><span><strong>{skillRating.evidence.acceptedPitchFrames}</strong> accepted pitch frames</span></div>
        </section>
      </div>

      <section className="practice-visualizer" aria-labelledby="practice-map-title">
        <header className="practice-visualizer-head"><div><span className="card-kicker"><Activity size={14} /> Practice map</span><h2 id="practice-map-title">See the shape of your work.</h2><p>Every completed Bocal tool records locally. The circles show days, the bars show practice type, and the notes show what the tuner or chord player heard.</p></div><span className="local-chip"><Archive size={12} /> Device data</span></header>
        <div className="practice-map-grid">
          <article className="day-orbit-card"><span>Days</span><div className="day-orbit">{activityWeek.map((day) => <div key={day.key} className={day.seconds ? "is-active" : ""} style={{ "--day-size": `${Math.max(30, Math.min(100, 28 + Math.sqrt(day.seconds) * 5))}%` } as CSSProperties}><i /><strong>{day.day}</strong><small>{minuteLabel(day.seconds)}</small></div>)}</div><p>{activeDays ? `${activeDays} active ${activeDays === 1 ? "day" : "days"} recorded this week.` : "Your first completed tool will light up this week."}</p></article>
          <article className="type-distribution-card"><span>Types</span>{activitiesByType.length ? <div className="type-distribution">{activitiesByType.map((item) => <div key={item.type}><span>{ACTIVITY_LABELS[item.type]}</span><i><b style={{ width: `${Math.max(7, item.seconds / Math.max(...activitiesByType.map((entry) => entry.seconds)) * 100)}%`, background: ACTIVITY_COLORS[item.type] }} /></i><strong>{minuteLabel(item.seconds)}</strong></div>)}</div> : <EmptyInsight text="Finish a tuning, pulse or chord flow to build this picture." />}</article>
          <article className="note-distribution-card"><span>Notes</span>{notes.length ? <div className="note-cloud">{notes.map(([noteName, count], index) => <span key={noteName} style={{ "--note-weight": `${Math.max(0.78, 1.28 - index * 0.09)}` } as CSSProperties}><b>{noteName}</b><small>{count}x</small></span>)}</div> : <EmptyInsight text="Clear tuner frames and chord roots appear here after you play." />}</article>
          <article className="gentle-win-card"><Sparkles size={17} /><span>Small win</span><strong>{activeDays ? "You made room for music this week." : "Your next two minutes count."}</strong><p>{activeDays ? "Keep the next session tiny and specific. Consistency is more useful than a streak counter." : "Start a tuner, pulse or chord flow. Bocal will remember the work, not guilt you into it."}</p></article>
        </div>
      </section>

      <div className="practice-lower-grid">
        <section className="repertoire-card">
          <div className="list-card-head"><div><span className="card-kicker"><Music2 size={14} /> Repertoire</span><h2>In the shed</h2></div><span className="local-chip"><Archive size={12} /> Local</span></div>
          <RepertoireRow title="Four-chord flow" meta="Original Bocal practice pattern · guitar" progress={chordFlowProgress} status="Playable" />
          {songWishes.slice(0, 3).map((wish) => <RepertoireRow key={wish.id} title={wish.title} meta="Your local song wishlist · score or chart not included" progress={0} status={wish.status === "studying" ? "Studying" : "Wishlist"} />)}
          {!songWishes.length && <RepertoireRow title="No songs saved yet" meta="Add a title you want to work on. Bocal does not include unlicensed scores, tabs or audio." progress={0} status="Wishlist" />}
          <form className="song-wishlist-form" onSubmit={addWish}>
            <input value={songTitle} onChange={(event) => setSongTitle(event.target.value)} placeholder="Add a song to your wishlist" aria-label="Song title to add to wishlist" maxLength={100} />
            <button type="submit" aria-label="Add song to wishlist" disabled={!songTitle.trim()}><Plus size={16} /></button>
          </form>
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


function EmptyInsight({ text }: { text: string }) {
  return <p className="practice-empty-insight"><CircleDot size={14} /> {text}</p>;
}
