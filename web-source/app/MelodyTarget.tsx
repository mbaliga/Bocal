"use client";

import { Copy, ListMusic, Pencil, Play, Plus, Save, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  BUNDLED_MELODIES,
  DEFAULT_MELODY_TEMPO,
  DEFAULT_NEW_NOTE_BEATS,
  MAX_USER_MELODIES,
  MELODY_BEATS_MAX,
  MELODY_BEATS_MIN,
  MELODY_MAX_NOTES,
  MELODY_MIDI_MAX,
  MELODY_MIDI_MIN,
  MELODY_NAME_MAX,
  MELODY_TEMPO_MAX,
  MELODY_TEMPO_MIN,
  melodyDurationMs,
  melodyPitchView,
  melodySegments,
  newMelodyId,
  noteStatistics,
  parseMelodies,
  sanitiseMelody,
  segmentIndexAt,
  serialiseMelodies,
  startMelodyOn,
  type Melody,
  type MelodyNote,
  type MelodySegment,
  type NoteStatistic,
} from "./melody-line";
import { clamp } from "./music-math";
import { fullNoteLabel, type NotationSystem } from "./notation";
import { VOCAL_MELODIES_KEY } from "./storage-keys";
import type { ReferencePlayback, ReferenceToneSpec } from "./useTuner";
import { usePersistedSetting } from "./usePersistedSetting";
import { clampWindowMs, defaultPitchView, formatSignedCents, samplePitch, type VocalGraphSource } from "./vocal-graph";
import type { GraphOverlay } from "./vocal-graph-canvas";
import type { VocalRange } from "./vocal-range";

/** The tuner's reference-tone path: one note, or a whole sequence scheduled on the AudioContext clock. */
export type PlayReference = (request: number | readonly ReferenceToneSpec[]) => Promise<ReferencePlayback | undefined> | void;

/** A quiet lead-in before the first note, so the graph is already moving when it arrives. */
const LEAD_SECONDS = 1.2;
/** The pass keeps collecting for this long after the last note ends. */
const TAIL_MS = 600;
/** While no microphone frames are repainting the graph, the "now" line is nudged this often. */
const IDLE_REPAINT_MS = 200;
const BEAT_CHOICES = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8];
const DEFAULT_NOTE_MIDI = 57;

type Draft = { id: string | null; name: string; tempoBpm: number; notes: MelodyNote[] };

type PassRun = {
  token: number;
  segments: MelodySegment[];
  endMs: number;
  bandCents: number;
  lastIndex: number;
  lastRepaintMs: number;
  needsMicrophone: boolean;
  raf: number | null;
  playback: ReferencePlayback | null;
};

export type MelodyTargetProps = {
  graph: VocalGraphSource;
  listening: boolean;
  notation: NotationSystem;
  saTonic: number;
  range: VocalRange | null;
  /** Half-width of each target band, in cents (the same band the Sustain step uses). */
  bandCents: number;
  overlayRef: MutableRefObject<GraphOverlay>;
  /** Asks the stage to repaint the graph after the overlay changed. */
  onOverlayChange: () => void;
  /** The stage hands taps on the graph's note names to this while a melody is being edited. */
  pickNoteRef: MutableRefObject<((midi: number) => boolean) | null>;
  playReference?: PlayReference;
  /** Called with the bundled melodies plus the singer's own whenever that list changes, so the play-along drill can offer them as phrases. */
  onMelodiesChange?: (melodies: Melody[]) => void;
};

const beatsLabel = (beats: number) => `${beats} ${beats === 1 ? "beat" : "beats"}`;
const secondsLabel = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * The Vocal stage's target melody: choose or write a short melody, hear it as
 * reference tones scheduled on the AudioContext clock, sing along while the
 * graph shows each note as a band, then read two figures per note. The figures
 * are pitch only (average distance in cents, time inside the band) and say
 * nothing about timing, technique or tone.
 */
export function MelodyTarget({ graph, listening, notation, saTonic, range, bandCents, overlayRef, onOverlayChange, pickNoteRef, playReference, onMelodiesChange }: MelodyTargetProps) {
  const [userMelodies, setUserMelodies] = usePersistedSetting<Melody[]>(VOCAL_MELODIES_KEY, parseMelodies, [], serialiseMelodies);
  const [selectedId, setSelectedId] = useState(BUNDLED_MELODIES[0].id);
  const [startOn, setStartOn] = useState<number | null>(null);
  const [playTones, setPlayTones] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newNoteBeats, setNewNoteBeats] = useState(DEFAULT_NEW_NOTE_BEATS);
  const [newNoteMidi, setNewNoteMidi] = useState(DEFAULT_NOTE_MIDI);
  const [phase, setPhase] = useState<"idle" | "starting" | "playing" | "done">("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [stats, setStats] = useState<NoteStatistic[] | null>(null);
  const [resultBand, setResultBand] = useState(bandCents);
  const [notice, setNotice] = useState("");

  const runRef = useRef<PassRun | null>(null);
  const tokenRef = useRef(0);
  const beatsRef = useRef(newNoteBeats);
  const bandRef = useRef(bandCents);
  const rangeRef = useRef(range);
  const listeningRef = useRef(listening);
  const changeRef = useRef(onOverlayChange);
  useEffect(() => {
    beatsRef.current = newNoteBeats;
    bandRef.current = bandCents;
    rangeRef.current = range;
    listeningRef.current = listening;
    changeRef.current = onOverlayChange;
  });

  const allMelodies = useMemo(() => BUNDLED_MELODIES.concat(userMelodies), [userMelodies]);
  useEffect(() => { onMelodiesChange?.(allMelodies); }, [allMelodies, onMelodiesChange]);
  const selected = allMelodies.find((melody) => melody.id === selectedId) || BUNDLED_MELODIES[0];
  const sung = startOn === null ? selected : startMelodyOn(selected, startOn);

  const noteLabel = useCallback((midi: number) => fullNoteLabel(midi, notation, saTonic), [notation, saTonic]);
  const choiceLow = clamp(range ? range.low - 5 : 36, MELODY_MIDI_MIN, MELODY_MIDI_MAX);
  const choiceHigh = clamp(range ? range.high + 5 : 84, choiceLow + 1, MELODY_MIDI_MAX);
  const noteChoices = useMemo(() => {
    const choices: number[] = [];
    for (let midi = choiceLow; midi <= choiceHigh; midi += 1) choices.push(midi);
    return choices;
  }, [choiceLow, choiceHigh]);

  // -- Putting the melody on the graph ----------------------------------------------

  const showOverlay = useCallback((next: GraphOverlay["melody"]) => {
    overlayRef.current.melody = next;
    changeRef.current();
  }, [overlayRef]);

  const finishRun = useCallback((run: PassRun) => {
    if (runRef.current !== run) return;
    if (run.raf !== null) cancelAnimationFrame(run.raf);
    runRef.current = null;
    const frames = graph.buffer.between(run.segments[0].startMs - 100, run.endMs + 100);
    const result = noteStatistics(run.segments, frames, run.bandCents);
    const heard = frames.some((frame) => samplePitch(frame) !== null);
    setResultBand(run.bandCents);
    // With the microphone off at the start and nothing heard, there is nothing to report per note.
    setStats(run.needsMicrophone || heard ? result : null);
    setActiveIndex(-1);
    setPhase("done");
    setNotice(heard
      ? "Pass finished. The bands stay on the graph so you can look back over your line. Clear the pass to return to the live graph."
      : run.needsMicrophone
        ? "No pitch was heard during the pass, so there is nothing to measure. Check that the microphone is picking you up."
        : "The microphone was off, so only the notes played. Start the microphone to see your line over the bands.");
  }, [graph]);

  const endRun = useCallback((message: string) => {
    tokenRef.current += 1;
    const run = runRef.current;
    runRef.current = null;
    if (run) {
      if (run.raf !== null) cancelAnimationFrame(run.raf);
      if (run.playback) run.playback.stop();
    }
    overlayRef.current.melody = null;
    changeRef.current();
    setStats(null);
    setActiveIndex(-1);
    setPhase("idle");
    setNotice(message);
  }, [overlayRef]);

  // An open editor shows its notes as numbered guide lines on the graph.
  const draftMidis = draft ? draft.notes.map((note) => note.midi).join(",") : null;
  useEffect(() => {
    if (draftMidis === null) return;
    showOverlay({ segments: [], bandCents: bandRef.current, view: null, pitch: null, draft: draftMidis === "" ? [] : draftMidis.split(",").map(Number) });
  }, [draftMidis, showOverlay]);

  // Taps on the graph's note names add a note while the editor is open.
  const editing = draft !== null;
  useEffect(() => {
    if (!editing) return;
    pickNoteRef.current = (midi: number) => {
      const note = clamp(Math.round(midi), MELODY_MIDI_MIN, MELODY_MIDI_MAX);
      setNewNoteMidi(note);
      setDraft((current) => (current && current.notes.length < MELODY_MAX_NOTES
        ? { ...current, notes: current.notes.concat({ midi: note, beats: beatsRef.current }) }
        : current));
      return true;
    };
    return () => { pickNoteRef.current = null; };
  }, [editing, pickNoteRef]);

  // -- A pass ---------------------------------------------------------------------------

  const startPass = useCallback(async () => {
    if (phase === "starting" || phase === "playing") return;
    if (!playTones && !listeningRef.current) {
      setNotice("Start the microphone to sing against the bands, or switch the notes on to listen.");
      return;
    }
    tokenRef.current += 1;
    const token = tokenRef.current;
    setStats(null);
    setNotice("");
    setPhase("starting");
    const melody = sung;
    const relative = melodySegments(melody, 0);
    let playback: ReferencePlayback | null = null;
    let originMs = performance.now();
    if (playTones && playReference) {
      const tones: ReferenceToneSpec[] = relative.map((segment) => ({
        midi: segment.midi,
        startOffsetSeconds: LEAD_SECONDS + segment.startMs / 1000,
        durationSeconds: (segment.endMs - segment.startMs) / 1000,
      }));
      const started = await playReference(tones);
      if (token !== tokenRef.current) {
        if (started) started.stop();
        return;
      }
      if (!started) {
        setPhase("idle");
        setNotice("The notes could not play. Check the audio output, or turn the notes off and sing along to the bands.");
        return;
      }
      playback = started;
      originMs = started.startedAtMs;
    } else if (playTones) {
      setPhase("idle");
      setNotice("Playing notes is not available here. Turn the notes off to sing along to the bands.");
      return;
    }
    const segments = melodySegments(melody, originMs + LEAD_SECONDS * 1000);
    const endMs = segments[segments.length - 1].endMs + TAIL_MS;
    const viewStart = originMs - 200;
    const windowMs = clampWindowMs(endMs + 600 - viewStart);
    const band = bandRef.current;
    const run: PassRun = {
      token,
      segments,
      endMs,
      bandCents: band,
      lastIndex: -2,
      lastRepaintMs: 0,
      needsMicrophone: listeningRef.current,
      raf: null,
      playback,
    };
    runRef.current = run;
    overlayRef.current.melody = {
      segments,
      bandCents: band,
      view: { windowMs, endMs: viewStart + windowMs },
      pitch: melodyPitchView(segments, defaultPitchView(rangeRef.current)),
      draft: [],
    };
    changeRef.current();
    setPhase("playing");
    const tick = () => {
      if (runRef.current !== run) return;
      const now = performance.now();
      const index = segmentIndexAt(run.segments, now);
      if (index !== run.lastIndex) {
        run.lastIndex = index;
        setActiveIndex(index);
        changeRef.current();
      } else if (!listeningRef.current && now - run.lastRepaintMs > IDLE_REPAINT_MS) {
        run.lastRepaintMs = now;
        changeRef.current();
      }
      if (now >= run.endMs) {
        finishRun(run);
        return;
      }
      run.raf = requestAnimationFrame(tick);
    };
    run.raf = requestAnimationFrame(tick);
  }, [phase, playTones, playReference, sung, finishRun, overlayRef]);

  const stopPass = () => endRun("Pass stopped.");

  const clearPass = () => endRun("");

  // The notes and the measurement only make sense while the clock they were laid on is running.
  useEffect(() => {
    const run = runRef.current;
    if (phase === "playing" && run && run.needsMicrophone && !listening) endRun("The microphone stopped, so the pass ended.");
  }, [listening, phase, endRun]);

  useEffect(() => {
    const abort = () => { if (runRef.current) endRun("The pass ended because Bocal went to the background."); };
    const onVisibility = () => { if (document.hidden) abort(); };
    window.addEventListener("pagehide", abort);
    window.addEventListener("bocal:host-pause", abort);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", abort);
      window.removeEventListener("bocal:host-pause", abort);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endRun]);

  useEffect(() => () => {
    tokenRef.current += 1;
    const run = runRef.current;
    runRef.current = null;
    if (run) {
      if (run.raf !== null) cancelAnimationFrame(run.raf);
      if (run.playback) run.playback.stop();
    }
    overlayRef.current.melody = null;
  }, [overlayRef]);

  // -- Choosing and editing melodies ------------------------------------------------------

  const selectMelody = (id: string) => {
    if (id === selectedId) return;
    if (phase !== "idle") endRun("");
    setSelectedId(id);
    setStartOn(null);
  };

  const openEditor = (from: Melody | null) => {
    if (phase !== "idle") endRun("");
    setNotice("");
    if (from) {
      setDraft({ id: from.source === "user" ? from.id : null, name: from.source === "user" ? from.name : `${from.name} (mine)`.slice(0, MELODY_NAME_MAX), tempoBpm: from.tempoBpm, notes: from.notes.map((note) => ({ ...note })) });
    } else {
      setDraft({ id: null, name: "My melody", tempoBpm: DEFAULT_MELODY_TEMPO, notes: [] });
    }
  };

  const closeEditor = () => {
    setDraft(null);
    overlayRef.current.melody = null;
    changeRef.current();
  };

  const addDraftNote = () => {
    setDraft((current) => (current && current.notes.length < MELODY_MAX_NOTES
      ? { ...current, notes: current.notes.concat({ midi: newNoteMidi, beats: newNoteBeats }) }
      : current));
  };

  const saveDraft = () => {
    if (!draft) return;
    const candidate = sanitiseMelody({ id: draft.id || newMelodyId(), name: draft.name, tempoBpm: draft.tempoBpm, notes: draft.notes });
    if (!candidate) {
      setNotice("Add at least one note before saving.");
      return;
    }
    if (!draft.id && userMelodies.length >= MAX_USER_MELODIES) {
      setNotice(`Bocal keeps up to ${MAX_USER_MELODIES} of your melodies. Delete one to make room.`);
      return;
    }
    setUserMelodies((current) => (draft.id && current.some((melody) => melody.id === candidate.id)
      ? current.map((melody) => (melody.id === candidate.id ? candidate : melody))
      : current.concat(candidate)));
    setSelectedId(candidate.id);
    setStartOn(null);
    setDraft(null);
    overlayRef.current.melody = null;
    changeRef.current();
    setNotice(`Saved “${candidate.name}” on this device.`);
  };

  const deleteSelected = () => {
    if (selected.source !== "user") return;
    if (!window.confirm(`Delete “${selected.name}” from this device?`)) return;
    setUserMelodies((current) => current.filter((melody) => melody.id !== selected.id));
    setSelectedId(BUNDLED_MELODIES[0].id);
    setStartOn(null);
    setNotice("Melody deleted.");
  };

  const busy = phase === "starting" || phase === "playing";
  const draftSeconds = draft ? melodyDurationMs({ tempoBpm: draft.tempoBpm, notes: draft.notes }) : 0;

  return (
    <section className="vocal-melody" aria-labelledby="vocal-melody-title">
      <header className="vocal-melody-head">
        <div>
          <span className="card-kicker"><ListMusic size={15} /> Target melody · pitch only</span>
          <h2 id="vocal-melody-title">Sing along to a melody</h2>
          <p>
            Pick a short melody and press Play pass. The notes sound as reference tones and appear on the graph above as bands; your line is drawn over them as you sing.
            Afterwards each note gets two figures: where your pitch sat on average, in cents, and how long it stayed inside the band.
            This is pitch information only. Bocal does not judge your timing, your technique or how the notes sound, and the figures are not a mark.
          </p>
        </div>
      </header>

      <div className="vocal-melody-list" role="group" aria-label="Melodies">
        {allMelodies.map((melody) => (
          <button
            type="button"
            key={melody.id}
            className={`vocal-melody-choice ${melody.id === selected.id ? "is-active" : ""}`}
            aria-pressed={melody.id === selected.id}
            disabled={editing}
            onClick={() => selectMelody(melody.id)}
          >
            <strong>{melody.name}</strong>
            <small>{melody.notes.length} {melody.notes.length === 1 ? "note" : "notes"} · {melody.tempoBpm} BPM · {secondsLabel(melodyDurationMs(melody))}</small>
            <span className="vocal-melody-tag" data-source={melody.source}>{melody.source === "bundled" ? "Bocal’s own exercise" : "Yours"}</span>
          </button>
        ))}
      </div>

      {!editing && (
        <div className="vocal-melody-player">
          <ol className="vocal-melody-notes" aria-label={`Notes in ${selected.name}${startOn === null ? "" : ", moved to start on " + noteLabel(sung.notes[0].midi)}`}>
            {sung.notes.map((note, index) => (
              <li key={index} className={activeIndex === index ? "is-current" : ""}>
                <b>{noteLabel(note.midi)}</b>
                <small>{beatsLabel(note.beats)}</small>
              </li>
            ))}
          </ol>
          {selected.id === "bundled-siren" && <p className="vocal-melody-help">The siren is two long held notes. Slide between them yourself; Bocal does not draw the slide.</p>}
          <div className="vocal-melody-controls">
            <label className="vocal-field" htmlFor="vocal-melody-start">
              <span>Start on</span>
              <select id="vocal-melody-start" value={startOn === null ? "" : String(startOn)} disabled={busy} onChange={(event) => setStartOn(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">As written ({noteLabel(selected.notes[0].midi)})</option>
                {noteChoices.map((midi) => <option key={midi} value={midi}>{noteLabel(midi)}</option>)}
              </select>
            </label>
            <label className="vocal-melody-check">
              <input type="checkbox" checked={playTones} disabled={busy} onChange={(event) => setPlayTones(event.target.checked)} />
              <span>Play the notes (use headphones if the microphone is on)</span>
            </label>
          </div>
          <div className="vocal-live-buttons vocal-melody-actions">
            {busy
              ? <button type="button" key="stop" className="button secondary" onClick={stopPass}><Square size={14} /> Stop pass</button>
              : <button type="button" key="play" className="button primary" onClick={() => void startPass()}><Play size={14} /> Play pass</button>}
            {phase === "done" && <button type="button" className="button secondary" onClick={clearPass}><X size={14} /> Clear pass</button>}
            <button type="button" className="button secondary" disabled={busy} onClick={() => openEditor(null)}><Plus size={14} /> New melody</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => openEditor(selected)}>
              {selected.source === "user" ? <><Pencil size={14} /> Edit</> : <><Copy size={14} /> Copy to edit</>}
            </button>
            {selected.source === "user" && <button type="button" className="button secondary" disabled={busy} onClick={deleteSelected}><Trash2 size={14} /> Delete</button>}
          </div>
        </div>
      )}

      {editing && draft && (
        <div className="vocal-melody-editor" role="group" aria-label="Melody editor">
          <div className="vocal-melody-controls">
            <label className="vocal-field" htmlFor="vocal-melody-name">
              <span>Name</span>
              <input id="vocal-melody-name" type="text" value={draft.name} maxLength={MELODY_NAME_MAX} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="vocal-field" htmlFor="vocal-melody-tempo">
              <span>Tempo ({MELODY_TEMPO_MIN} to {MELODY_TEMPO_MAX} beats per minute)</span>
              <input
                id="vocal-melody-tempo"
                type="number"
                min={MELODY_TEMPO_MIN}
                max={MELODY_TEMPO_MAX}
                inputMode="numeric"
                value={draft.tempoBpm}
                onChange={(event) => setDraft({ ...draft, tempoBpm: clamp(Math.round(Number(event.target.value)) || MELODY_TEMPO_MIN, MELODY_TEMPO_MIN, MELODY_TEMPO_MAX) })}
              />
            </label>
          </div>
          <div className="vocal-melody-controls">
            <label className="vocal-field" htmlFor="vocal-melody-note">
              <span>Next note</span>
              <select id="vocal-melody-note" value={newNoteMidi} onChange={(event) => setNewNoteMidi(Number(event.target.value))}>
                {noteChoices.map((midi) => <option key={midi} value={midi}>{noteLabel(midi)}</option>)}
                {noteChoices.indexOf(newNoteMidi) < 0 && <option value={newNoteMidi}>{noteLabel(newNoteMidi)}</option>}
              </select>
            </label>
            <label className="vocal-field" htmlFor="vocal-melody-beats">
              <span>Length ({MELODY_BEATS_MIN} to {MELODY_BEATS_MAX} beats)</span>
              <select id="vocal-melody-beats" value={newNoteBeats} onChange={(event) => setNewNoteBeats(Number(event.target.value))}>
                {BEAT_CHOICES.map((beats) => <option key={beats} value={beats}>{beatsLabel(beats)}</option>)}
              </select>
            </label>
            <button type="button" className="button secondary" onClick={addDraftNote} disabled={draft.notes.length >= MELODY_MAX_NOTES}><Plus size={14} /> Add note</button>
          </div>
          <p className="vocal-melody-help">You can also tap a note name down the left edge of the graph to add that note with the length chosen here. Notes can run from {noteLabel(MELODY_MIDI_MIN)} to {noteLabel(MELODY_MIDI_MAX)}; up to {MELODY_MAX_NOTES} notes.</p>
          {draft.notes.length === 0
            ? <p className="vocal-melody-empty">No notes yet.</p>
            : (
              <ol className="vocal-melody-notes is-editing" aria-label="Notes in this melody">
                {draft.notes.map((note, index) => (
                  <li key={index}>
                    <b>{noteLabel(note.midi)}</b>
                    <small>{beatsLabel(note.beats)}</small>
                    <button type="button" className="vocal-melody-remove" aria-label={`Remove note ${index + 1}, ${noteLabel(note.midi)}`} onClick={() => setDraft({ ...draft, notes: draft.notes.filter((_, at) => at !== index) })}><X size={12} /></button>
                  </li>
                ))}
              </ol>
            )}
          <p className="vocal-melody-help">{draft.notes.length} {draft.notes.length === 1 ? "note" : "notes"} · {secondsLabel(draftSeconds)} at {draft.tempoBpm} BPM</p>
          <div className="vocal-live-buttons vocal-melody-actions">
            <button type="button" className="button primary" onClick={saveDraft} disabled={draft.notes.length === 0}><Save size={14} /> Save melody</button>
            <button type="button" className="button secondary" onClick={() => setDraft({ ...draft, notes: draft.notes.slice(0, -1) })} disabled={draft.notes.length === 0}>Undo last note</button>
            <button type="button" className="button secondary" onClick={closeEditor}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <p className="vocal-melody-status" role="status" aria-live="polite">
        {phase === "starting" ? "Getting the notes ready…" : phase === "playing" ? "Playing. Sing along to the bands on the graph." : notice}
      </p>

      {stats && !editing && (
        <div className="vocal-melody-results">
          <h3>What your pitch did, note by note</h3>
          <ol aria-label="Per-note figures">
            {stats.map((stat) => (
              <li key={stat.index}>
                <b>{stat.index + 1}</b>
                <span className="vocal-melody-result-note">{noteLabel(stat.midi)}</span>
                {stat.meanCents === null
                  ? <span className="vocal-melody-result-none">No pitch heard during this note</span>
                  : (
                    <>
                      <span><small>Average</small> {formatSignedCents(stat.meanCents)}&cent;</span>
                      <span><small>Inside ±{resultBand}&cent;</small> {secondsLabel(stat.inBandMs)} of {secondsLabel(stat.durationMs)}</span>
                      <i className="vocal-melody-meter" aria-hidden="true"><em style={{ width: `${Math.round(stat.inBandFraction * 100)}%` }} /></i>
                    </>
                  )}
              </li>
            ))}
          </ol>
          <p className="vocal-melody-help">
            Average is how far your pitch sat above (+) or below (−) the note, averaged over the moments a pitch was heard. Inside is how long it stayed within ±{resultBand}&cent; of the note.
            The first moments of a note include the time it takes to find the pitch, and a microphone reading arrives a little after the sound. These figures describe pitch only; they say nothing about timing, technique or tone.
          </p>
        </div>
      )}
    </section>
  );
}
