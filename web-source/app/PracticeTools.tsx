"use client";

import {
  Award,
  Activity,
  Archive,
  BookOpen,
  Check,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Gauge,
  Headphones,
  Music2,
  Play,
  Plus,
  Save,
  Share2,
  Sparkles,
  Target,
  UserRound,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { addSongWish, COMPLETED_PRACTICE_STORAGE_KEY, parsePracticeActivities, parseSongWishlist, PRACTICE_ACTIVITY_STORAGE_KEY, SONG_WISHLIST_STORAGE_KEY, updateSongWish, type PracticeActivity, type PracticeActivityType, type SongWish } from "./practice-data";
import {
  calculateSkillRating,
  emptySkillEvidence,
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  type SkillEvidenceBundle,
} from "./skill-rating";
import "./styles/practice.css";

// PulseView used to live in this file; it moved to its own module (see
// PulseView.tsx for why) but stays re-exported here so page.tsx's existing
// `import { PulseView } from "./PracticeTools"` needs no change in this
// wave. WP1/page.tsx: the new home is `./PulseView` if you want to import it
// directly (and it now takes an optional `tuningOptions` prop).
export { PulseView } from "./PulseView";

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

type SessionRecord = { date: string; seconds: number; note?: string };

/** `bocal-sessions`: hand-edited or corrupt data must never reach `.reduce` in weekFromSessions, so anything short of a plain array of {date, seconds} is dropped rather than trusted. */
function parseSessions(raw: string | null): SessionRecord[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SessionRecord =>
      Boolean(item) && typeof item === "object" && typeof item.date === "string" && typeof item.seconds === "number" && Number.isFinite(item.seconds));
  } catch {
    return [];
  }
}

/** `bocal-completed-practice-v1`: same shape guard as parseSessions, so a bad value can't crash `completed.includes(...)` in render. */
function parseCompleted(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

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
    // Each key is restored in its own try: local storage can be unavailable
    // (private browsing) or one key can hold hand-edited/corrupt JSON, and
    // neither case should blank out the other five restores along with it.
    const restore = () => {
      try { setSessions(parseSessions(localStorage.getItem("bocal-sessions"))); } catch { /* ignore */ }
      try { setActivities(parsePracticeActivities(localStorage.getItem(PRACTICE_ACTIVITY_STORAGE_KEY))); } catch { /* ignore */ }
      try { setSongWishes(parseSongWishlist(localStorage.getItem(SONG_WISHLIST_STORAGE_KEY))); } catch { /* ignore */ }
      try { setCompleted(parseCompleted(localStorage.getItem(COMPLETED_PRACTICE_STORAGE_KEY))); } catch { /* ignore */ }
      try { setWeeklyGoal(Number(localStorage.getItem("bocal-weekly-goal-minutes") ?? 60)); } catch { /* ignore */ }
      try { setSavedNote(localStorage.getItem("bocal-lesson-note") ?? ""); } catch { /* ignore */ }
      try { setSkillEvidence(parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY))); } catch { /* ignore */ }
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
  // Matches the neighbouring Days/streak cards, which are also windowed to
  // the last 7 days: mixing an all-time total in here under a "this week"
  // label made the two cards on this screen silently disagree about what
  // "this week" meant.
  const weekDayKeys = useMemo(() => new Set(week.map((day) => day.key)), [week]);
  const activitiesByType = useMemo(() => (Object.keys(ACTIVITY_LABELS) as PracticeActivityType[])
    .map((type) => ({
      type,
      seconds: activities.filter((activity) => activity.type === type && weekDayKeys.has(activityDayKey(activity))).reduce((sum, activity) => sum + activity.seconds, 0),
    }))
    .filter((item) => item.seconds > 0), [activities, weekDayKeys]);
  const notes = useMemo(() => Object.entries(activities.flatMap((activity) => activity.notes ?? []).reduce<Record<string, number>>((counts, noteName) => {
    counts[noteName] = (counts[noteName] ?? 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]).slice(0, 6), [activities]);
  const activeDays = useMemo(() => activityWeek.filter((day) => day.seconds > 0).length, [activityWeek]);
  const activityMinutes = useMemo(() => Math.round(activityWeek.reduce((sum, day) => sum + day.seconds, 0) / 60), [activityWeek]);
  const goalProgress = Math.min(100, Math.round((activityMinutes / Math.max(1, weeklyGoal)) * 100));
  // Counted over every stored activity (not just the 7-day window shown
  // elsewhere on this screen), and starting at yesterday rather than today:
  // a player who practised the six days before today, but hasn't yet opened
  // Bocal today, should see their real streak rather than "0 day streak"
  // until they do.
  const currentStreak = useMemo(() => {
    const daysWithActivity = new Set(activities.map(activityDayKey).filter(Boolean));
    const today = new Date();
    const todayKey = dayKey(today);
    let streak = 0;
    let cursor = daysWithActivity.has(todayKey) ? 0 : 1;
    for (;;) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - cursor, 12);
      if (!daysWithActivity.has(dayKey(date))) break;
      streak += 1;
      cursor += 1;
    }
    return streak;
  }, [activities]);
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
          <article className="type-distribution-card"><span>Types · this week</span>{activitiesByType.length ? <div className="type-distribution">{activitiesByType.map((item) => <div key={item.type}><span>{ACTIVITY_LABELS[item.type]}</span><i><b style={{ width: `${Math.max(7, item.seconds / Math.max(...activitiesByType.map((entry) => entry.seconds)) * 100)}%`, background: ACTIVITY_COLORS[item.type] }} /></i><strong>{minuteLabel(item.seconds)}</strong></div>)}</div> : <EmptyInsight text="Finish a tuning, pulse or chord flow to build this picture." />}</article>
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

        <EquipmentLog />
      </div>
    </div>
  );
}

type EquipmentKind = "reed" | "mouthpiece" | "other";
type EquipmentItem = { id: string; label: string; kind: EquipmentKind; addedAt: string };
const EQUIPMENT_LOG_KEY = "bocal-setup-log-v1";
const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = { reed: "Reed", mouthpiece: "Mouthpiece", other: "Other" };

function parseEquipmentLog(raw: string | null): EquipmentItem[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EquipmentItem =>
      Boolean(item) && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string" && typeof item.addedAt === "string"
      && (item.kind === "reed" || item.kind === "mouthpiece" || item.kind === "other"));
  } catch {
    return [];
  }
}

function daysInRotation(addedAt: string) {
  const opened = new Date(addedAt).getTime();
  if (!Number.isFinite(opened)) return null;
  return Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
}

/**
 * A real local log of the player's own reeds/mouthpieces, replacing the
 * fixed "Vandoren Traditional" / "Yamaha 4C" placeholder that used to render
 * for every fresh profile as if it were the player's actual gear
 * (metronome.md "Equipment card ... presented as the player's own data").
 * Everything here is what the player typed in, kept only on this device.
 */
function EquipmentLog() {
  const [items, setItems] = useState<EquipmentItem[]>(() => (typeof window === "undefined" ? [] : parseEquipmentLog(localStorage.getItem(EQUIPMENT_LOG_KEY))));
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EquipmentKind>("reed");

  const persist = (next: EquipmentItem[]) => {
    setItems(next);
    try { localStorage.setItem(EQUIPMENT_LOG_KEY, JSON.stringify(next)); } catch { /* Optional local equipment log. */ }
  };
  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = label.trim().slice(0, 60);
    if (!clean) return;
    const item: EquipmentItem = { id: `setup-${Date.now()}`, label: clean, kind, addedAt: new Date().toISOString() };
    persist([item, ...items].slice(0, 12));
    setLabel("");
  };
  const removeItem = (id: string) => persist(items.filter((item) => item.id !== id));

  return (
    <section className="equipment-card">
      <div className="list-card-head"><div><span className="card-kicker"><Gauge size={14} /> Equipment</span><h2>Your current setup</h2></div></div>
      {items.length ? (
        <ul className="setup-log-list">
          {items.map((item) => {
            const days = daysInRotation(item.addedAt);
            return (
              <li key={item.id} className="setup-row">
                <span className={`setup-art ${item.kind === "mouthpiece" ? "mouthpiece" : ""}`}>{EQUIPMENT_KIND_LABELS[item.kind][0]}</span>
                <div><strong>{item.label}</strong><span>{EQUIPMENT_KIND_LABELS[item.kind]}{days !== null ? ` · ${days} ${days === 1 ? "day" : "days"} in rotation` : ""}</span></div>
                <button type="button" aria-label={`Remove ${item.label}`} onClick={() => removeItem(item.id)}><X size={13} /></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyInsight text="Log the reed or mouthpiece you're playing on so Bocal can track how long it's been in rotation." />
      )}
      <form className="setup-log-form" onSubmit={addItem}>
        <select value={kind} onChange={(event) => setKind(event.target.value as EquipmentKind)} aria-label="Equipment kind">
          {(Object.keys(EQUIPMENT_KIND_LABELS) as EquipmentKind[]).map((option) => <option key={option} value={option}>{EQUIPMENT_KIND_LABELS[option]}</option>)}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Vandoren Traditional 3" aria-label="Equipment name" maxLength={60} />
        <button type="submit" disabled={!label.trim()}><Plus size={14} /> Log it</button>
      </form>
    </section>
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
          <span><strong>{rating.evidence.rhythmHits}</strong> rhythm taps</span>
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
        <p>A score becomes established after 3 tuner sessions, 600 accepted frames, 30 fingering checks, 64 rhythm taps and 18 different notes. The same saved data always produces the same result. These are Bocal benchmarks, not a ranking against other players.</p>
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
