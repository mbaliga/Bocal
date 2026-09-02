"use client";

import {
  Award,
  Activity,
  Archive,
  BellRing,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
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
  Target,
  UserRound,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { addSongWish, COMPLETED_PRACTICE_STORAGE_KEY, parsePracticeActivities, parseSongWishlist, PRACTICE_ACTIVITY_STORAGE_KEY, recordPracticeActivity, SONG_WISHLIST_STORAGE_KEY, updateSongWish, type PracticeActivity, type PracticeActivityType, type SongWish } from "./practice-data";
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

type ClickVoice = "pure" | "wood" | "beep" | "clave";
type MetronomePreset = { id: string; name: string; bpm: number; beatsPerBar: number; subdivision: number; voice: ClickVoice; countInBars: number; muteEveryBars: number };
const METRONOME_PRESETS_KEY = "bocal-metronome-presets-v1";
const DEFAULT_METRONOME_PRESETS: MetronomePreset[] = [
  { id: "straight-4", name: "Straight 4/4", bpm: 92, beatsPerBar: 4, subdivision: 1, voice: "pure", countInBars: 1, muteEveryBars: 0 },
  { id: "slow-landing", name: "Slow landing", bpm: 56, beatsPerBar: 4, subdivision: 2, voice: "wood", countInBars: 2, muteEveryBars: 0 },
  { id: "silent-bar", name: "Silent bar", bpm: 80, beatsPerBar: 4, subdivision: 1, voice: "clave", countInBars: 1, muteEveryBars: 4 },
];

function audioClick(context: AudioContext, accent: boolean, subdivision: boolean, when: number, voice: ClickVoice) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const settings: Record<ClickVoice, { type: OscillatorType; accent: number; beat: number; sub: number }> = {
    pure: { type: "sine", accent: 1320, beat: 880, sub: 560 },
    wood: { type: "triangle", accent: 980, beat: 700, sub: 430 },
    beep: { type: "square", accent: 1480, beat: 920, sub: 620 },
    clave: { type: "sawtooth", accent: 1180, beat: 820, sub: 500 },
  };
  const selected = settings[voice];
  oscillator.type = selected.type;
  oscillator.frequency.value = accent ? selected.accent : subdivision ? selected.sub : selected.beat;
  gain.gain.setValueAtTime(subdivision ? 0.035 : 0.08, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (subdivision ? 0.03 : 0.06));
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
  const [clickVoice, setClickVoice] = useState<ClickVoice>("pure");
  const [countInBars, setCountInBars] = useState(1);
  const [muteEveryBars, setMuteEveryBars] = useState(0);
  const [presets, setPresets] = useState<MetronomePreset[]>(() => {
    if (typeof window === "undefined") return DEFAULT_METRONOME_PRESETS;
    try {
      const saved = JSON.parse(localStorage.getItem(METRONOME_PRESETS_KEY) ?? "null");
      return Array.isArray(saved) ? [...DEFAULT_METRONOME_PRESETS, ...saved].slice(0, 12) : DEFAULT_METRONOME_PRESETS;
    } catch { return DEFAULT_METRONOME_PRESETS; }
  });
  const [presetName, setPresetName] = useState("");
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
        const bar = Math.floor(index / (subdivision * beatsPerBar));
        const accent = beat === 0 && subTick === 0;
        const inCountIn = bar < countInBars;
        const mutedBar = muteEveryBars > 0 && !inCountIn && (bar - countInBars + 1) % muteEveryBars === 0;
        if (!mutedBar) audioClick(context, accent, subTick !== 0, when, clickVoice);
        if (subTick === 0) {
          visualTimers.push(
            window.setTimeout(
              () => {
                setCurrentBeat(beat);
                if (hapticsRef.current && navigator.vibrate && !mutedBar) navigator.vibrate(accent ? 28 : 14);
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
  }, [beatsPerBar, bpm, clickVoice, countInBars, muteEveryBars, playing, subdivision]);

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
  const resetMetronome = () => { setBpm(92); setSubdivision(1); setBeatsPerBar(4); setClickVoice("pure"); setCountInBars(1); setMuteEveryBars(0); };
  const applyPreset = (preset: MetronomePreset) => {
    setBpm(preset.bpm); setBeatsPerBar(preset.beatsPerBar); setSubdivision(preset.subdivision);
    setClickVoice(preset.voice); setCountInBars(preset.countInBars); setMuteEveryBars(preset.muteEveryBars);
  };
  const savePreset = () => {
    const name = presetName.trim().replace(/\s+/g, " ").slice(0, 36);
    if (!name) return;
    const preset: MetronomePreset = { id: `preset-${Date.now()}`, name, bpm, beatsPerBar, subdivision, voice: clickVoice, countInBars, muteEveryBars };
    const custom = [...presets.filter((item) => !DEFAULT_METRONOME_PRESETS.some((defaultPreset) => defaultPreset.id === item.id)), preset].slice(-9);
    setPresets([...DEFAULT_METRONOME_PRESETS, ...custom]);
    setPresetName("");
    try { localStorage.setItem(METRONOME_PRESETS_KEY, JSON.stringify(custom)); } catch { /* Optional local preset storage. */ }
  };

  return (
    <div className="content-wrap pulse-view">
      <section className="section-heading">
        <div><p className="eyebrow">Pulse · Metronome</p><h1>Set the pulse.</h1><p>Adjust the tempo, meter and subdivision, or add a tuning drone underneath.</p></div>
        <div className={`live-badge ${playing ? "metronome-live" : ""}`}><span className={playing ? "pulse-dot" : "quiet-dot"} /> {playing ? "In motion" : "Ready"}</div>
      </section>

      <div className="pulse-grid">
        <section className="metronome-card">
          <div className="metronome-top"><span><Waves size={15} /> {tempoName}</span><button onClick={resetMetronome}><RotateCcw size={14} /> Reset</button></div>
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
          <article className="control-card"><div className="control-head"><span><Volume2 size={15} /> Click voice</span><small>Built-in synth</small></div><div className="choice-row voice-choices">{([{ id: "pure", label: "Pure" }, { id: "wood", label: "Wood" }, { id: "beep", label: "Beep" }, { id: "clave", label: "Clave" }] as { id: ClickVoice; label: string }[]).map((voice) => <button key={voice.id} className={clickVoice === voice.id ? "is-active" : ""} onClick={() => setClickVoice(voice.id)}>{voice.label}</button>)}</div></article>
          <article className="control-card"><div className="control-head"><span><Clock3 size={15} /> Count-in</span><small>{countInBars ? `${countInBars} ${countInBars === 1 ? "bar" : "bars"}` : "Off"}</small></div><div className="choice-row"><button className={countInBars === 0 ? "is-active" : ""} onClick={() => setCountInBars(0)}>Off</button>{[1, 2, 4].map((count) => <button key={count} className={countInBars === count ? "is-active" : ""} onClick={() => setCountInBars(count)}>{count}</button>)}</div></article>
          <article className="control-card"><div className="control-head"><span><Zap size={15} /> Silent-bar drill</span><small>{muteEveryBars ? `Every ${muteEveryBars} bars` : "Off"}</small></div><div className="choice-row"><button className={muteEveryBars === 0 ? "is-active" : ""} onClick={() => setMuteEveryBars(0)}>Off</button>{[2, 4, 8].map((count) => <button key={count} className={muteEveryBars === count ? "is-active" : ""} onClick={() => setMuteEveryBars(count)}>{count}</button>)}</div></article>
          <article className="control-card haptic-control"><div><span><BellRing size={15} /> Feel the beat</span><p>A tactile pulse keeps your eyes on the music.</p></div><button className={`toggle ${haptics ? "is-on" : ""}`} onClick={() => setHaptics((value) => !value)} aria-pressed={haptics}><i /></button></article>
        </aside>
      </div>

      <section className="metronome-presets" aria-labelledby="metronome-presets-title">
        <div><span className="card-kicker"><Save size={14} /> Presets</span><h2 id="metronome-presets-title">Save the feel you’re working on.</h2><p>Count-ins and silent bars stay with each preset on this device.</p></div>
        <div className="preset-list">{presets.map((preset) => <button key={preset.id} className="preset-chip" onClick={() => applyPreset(preset)}><strong>{preset.name}</strong><small>{preset.bpm} BPM · {preset.beatsPerBar}/4{preset.muteEveryBars ? " · silent bar" : ""}</small></button>)}</div>
        <form className="preset-save" onSubmit={(event) => { event.preventDefault(); savePreset(); }}><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name this preset" maxLength={36} aria-label="Preset name" /><button type="submit" disabled={!presetName.trim()}><Plus size={14} /> Save</button></form>
      </section>

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

/** Day bucket for a logged activity, matching the keys weekFromSessions emits. */
function activityDayKey(activity: PracticeActivity) {
  const captured = new Date(activity.capturedAt);
  return Number.isFinite(captured.getTime()) ? dayKey(captured) : "";
}

/** "12 min", "1h 05m", or an em dash for nothing yet -- sized for the day orbit chips. */
function minuteLabel(seconds: number) {
  if (!(seconds > 0)) return "\u2014";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
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
  const [weeklyGoal, setWeeklyGoal] = useState(60);
  const [skillEvidence, setSkillEvidence] = useState<SkillEvidenceBundle>(() => emptySkillEvidence());

  useEffect(() => {
    const restore = () => {
      try {
        setSessions(JSON.parse(localStorage.getItem("bocal-sessions") ?? "[]"));
        setActivities(parsePracticeActivities(localStorage.getItem(PRACTICE_ACTIVITY_STORAGE_KEY)));
        setSongWishes(parseSongWishlist(localStorage.getItem(SONG_WISHLIST_STORAGE_KEY)));
        setCompleted(JSON.parse(localStorage.getItem(COMPLETED_PRACTICE_STORAGE_KEY) ?? "[]"));
        setWeeklyGoal(Number(localStorage.getItem("bocal-weekly-goal-minutes") ?? 60));
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
  const activityMinutes = useMemo(() => Math.round(activityWeek.reduce((sum, day) => sum + day.seconds, 0) / 60), [activityWeek]);
  const goalProgress = Math.min(100, Math.round((activityMinutes / Math.max(1, weeklyGoal)) * 100));
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let index = activityWeek.length - 1; index >= 0; index -= 1) {
      if (activityWeek[index].seconds <= 0) break;
      streak += 1;
    }
    return streak;
  }, [activityWeek]);
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
  const toggleComplete = (id: string) => setCompleted((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    try { localStorage.setItem(COMPLETED_PRACTICE_STORAGE_KEY, JSON.stringify(next)); } catch { /* Optional local checklist persistence. */ }
    return next;
  });
  const changeWeeklyGoal = (next: number) => {
    setWeeklyGoal(next);
    try { localStorage.setItem("bocal-weekly-goal-minutes", String(next)); } catch { /* Optional local goal persistence. */ }
  };

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

      <section className="practice-goal-card" aria-labelledby="practice-goal-title">
        <div className="practice-goal-copy"><span className="card-kicker"><Target size={14} /> Gentle goal</span><h2 id="practice-goal-title">A little structure, no guilt.</h2><p>{activityMinutes ? `${activityMinutes} focused minutes are logged this week.` : "Set a small weekly target and let the record build naturally."}</p></div>
        <div className="goal-ring" style={{ "--goal-progress": `${goalProgress}%` } as CSSProperties}><strong>{goalProgress}%</strong><small>of {weeklyGoal} min</small></div>
        <div className="goal-stats"><span><Award size={15} /><strong>{currentStreak}</strong><small>day streak</small></span><span><Activity size={15} /><strong>{activeDays}</strong><small>active days</small></span></div>
        <label className="goal-picker"><span>Weekly target</span><select value={weeklyGoal} onChange={(event) => changeWeeklyGoal(Number(event.target.value))}>{[30, 60, 90, 120, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      </section>

      <section className="practice-visualizer" aria-labelledby="practice-map-title">
        <header className="practice-visualizer-head"><div><span className="card-kicker"><Activity size={14} /> Practice map</span><h2 id="practice-map-title">See the shape of your work.</h2><p>Every completed Bocal tool records locally. The circles show days, the bars show practice type, and the notes show what the tuner or chord player heard.</p></div><span className="local-chip"><Archive size={12} /> Device data</span></header>
        <div className="practice-map-grid">
          <article className="day-orbit-card"><span>Days</span><div className="day-orbit">{activityWeek.map((day) => <div key={day.key} className={day.seconds ? "is-active" : ""} style={{ "--day-size": `${Math.max(30, Math.min(100, 28 + Math.sqrt(day.seconds) * 5))}%` } as CSSProperties}><i /><strong>{day.day}</strong><small>{minuteLabel(day.seconds)}</small></div>)}</div><p>{activeDays ? `${activeDays} active ${activeDays === 1 ? "day" : "days"} recorded this week.` : "Your first completed tool will light up this week."}</p></article>
          <article className="type-distribution-card"><span>Types</span>{activitiesByType.length ? <div className="type-distribution">{activitiesByType.map((item) => <div key={item.type}><span>{ACTIVITY_LABELS[item.type]}</span><i><b style={{ width: `${Math.max(7, item.seconds / Math.max(...activitiesByType.map((entry) => entry.seconds)) * 100)}%`, background: ACTIVITY_COLORS[item.type] }} /></i><strong>{minuteLabel(item.seconds)}</strong></div>)}</div> : <EmptyInsight text="Finish a tuning, pulse or chord flow to build this picture." />}</article>
          <article className="note-distribution-card"><span>Notes</span>{notes.length ? <div className="note-cloud">{notes.map(([noteName, count], index) => <span key={noteName} style={{ "--note-weight": `${Math.max(0.78, 1.28 - index * 0.09)}` } as CSSProperties}><b>{noteName}</b><small>{count}x</small></span>)}</div> : <EmptyInsight text="Clear tuner frames and chord roots appear here after you play." />}</article>
          <article className="gentle-win-card"><Sparkles size={17} /><span>Small win</span><strong>{activeDays ? "You made room for music this week." : "Your next two minutes count."}</strong><p>{activeDays ? "Keep the next session tiny and specific. Consistency is more useful than a streak counter." : "Start a tuner, pulse or chord flow. Bocal will remember the work, not guilt you into it."}</p></article>
        </div>
      </section>

      <CoachBoard />

      <div className="practice-lower-grid">
        <section className="repertoire-card">
          <div className="list-card-head"><div><span className="card-kicker"><Music2 size={14} /> Repertoire</span><h2>In the shed</h2></div><span className="local-chip"><Archive size={12} /> Local</span></div>
          <RepertoireRow title="Four-chord flow" meta="Original Bocal practice pattern · guitar" progress={chordFlowProgress} status="Playable" />
          {songWishes.slice(0, 3).map((wish) => <RepertoireRow key={wish.id} title={wish.title} meta="Local title only · add your own licensed chart or audio" progress={wish.progress ?? 0} status={wish.status === "studying" ? "Studying" : "Wishlist"} onProgress={(progress) => updateSongWish(wish.id, { progress, status: progress > 0 ? "studying" : wish.status })} onStatus={() => updateSongWish(wish.id, { status: wish.status === "studying" ? "wishlist" : "studying" })} />)}
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

type CoachPlan = {
  coachName: string;
  studentName: string;
  focus: string;
  assignment: string;
  checkIn: string;
  capabilities: string[];
};

const COACH_PLAN_KEY = "bocal-coach-plan-v1";
const COACH_CAPABILITIES = ["Pitch and tuning", "Rhythm and pulse", "Technique and fingering", "Repertoire goals", "Reflection and next step"];
const EMPTY_COACH_PLAN: CoachPlan = { coachName: "", studentName: "", focus: "", assignment: "", checkIn: "", capabilities: COACH_CAPABILITIES };

function CoachBoard() {
  const [plan, setPlan] = useState<CoachPlan>(() => {
    if (typeof window === "undefined") return EMPTY_COACH_PLAN;
    try {
      const stored = JSON.parse(localStorage.getItem(COACH_PLAN_KEY) ?? "null");
      return stored && typeof stored === "object" ? { ...EMPTY_COACH_PLAN, ...stored } : EMPTY_COACH_PLAN;
    } catch { return EMPTY_COACH_PLAN; }
  });
  const [saved, setSaved] = useState(false);

  const update = (field: keyof Omit<CoachPlan, "capabilities">, value: string) => setPlan((current) => ({ ...current, [field]: value }));
  const toggleCapability = (capability: string) => setPlan((current) => ({ ...current, capabilities: current.capabilities.includes(capability) ? current.capabilities.filter((item) => item !== capability) : [...current.capabilities, capability] }));
  const save = () => {
    try { localStorage.setItem(COACH_PLAN_KEY, JSON.stringify(plan)); } catch { /* Optional local coach plan storage. */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  const exportPlan = () => {
    const payload = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...plan }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "bocal-coach-brief.json"; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="coach-board" aria-labelledby="coach-board-title">
      <header className="coach-board-head"><div><span className="card-kicker"><UserRound size={14} /> Coach mode · local board</span><h2 id="coach-board-title">Keep the human thread.</h2><p>Plan an assignment, review evidence, and export a compact brief. Bocal does not pretend to sync student data until an account and consent model exist.</p></div><span className="local-chip"><ClipboardCheck size={12} /> Private on this device</span></header>
      <div className="coach-form-grid">
        <label><span>Coach</span><input value={plan.coachName} onChange={(event) => update("coachName", event.target.value)} placeholder="Name" /></label>
        <label><span>Player</span><input value={plan.studentName} onChange={(event) => update("studentName", event.target.value)} placeholder="Name" /></label>
        <label><span>Next check-in</span><input type="date" value={plan.checkIn} onChange={(event) => update("checkIn", event.target.value)} /></label>
        <label><span>Current focus</span><input value={plan.focus} onChange={(event) => update("focus", event.target.value)} placeholder="e.g. steady attacks" /></label>
        <label className="coach-assignment"><span>Assignment</span><textarea value={plan.assignment} onChange={(event) => update("assignment", event.target.value)} placeholder="What should the player do before the next check-in?" /></label>
      </div>
      <div className="coach-capabilities"><span>What the review covers</span>{COACH_CAPABILITIES.map((capability) => <button key={capability} className={plan.capabilities.includes(capability) ? "is-active" : ""} onClick={() => toggleCapability(capability)}>{plan.capabilities.includes(capability) ? <Check size={13} /> : <CircleDot size={13} />}{capability}</button>)}</div>
      <div className="coach-actions"><button className="button secondary" onClick={save}><Save size={14} /> {saved ? "Saved" : "Save coach plan"}</button><button className="button secondary" onClick={exportPlan}><Share2 size={14} /> Export brief</button></div>
    </section>
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

function RepertoireRow({ title, meta, progress, status, onProgress, onStatus }: { title: string; meta: string; progress: number; status: string; onProgress?: (progress: number) => void; onStatus?: () => void }) {
  return <div className="repertoire-row"><span className="album-tile"><Music2 size={17} /></span><div><strong>{title}</strong><small>{meta}</small><span className="repertoire-progress"><i style={{ width: `${progress}%` }} /></span>{onProgress && <input className="repertoire-slider" type="range" min="0" max="100" step="5" value={progress} onChange={(event) => onProgress(Number(event.target.value))} aria-label={`${title} progress`} />}</div><button className="repertoire-status" onClick={onStatus} disabled={!onStatus}>{status}</button></div>;
}


function EmptyInsight({ text }: { text: string }) {
  return <p className="practice-empty-insight"><CircleDot size={14} /> {text}</p>;
}
