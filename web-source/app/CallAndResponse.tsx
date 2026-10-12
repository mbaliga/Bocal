"use client";

import { Check, Ear, Mic2, Play, RotateCcw, SkipForward, Square, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCallHost, subscribeCallHost, type CallHost, type PhraseTone } from "./call-host";
import {
  DEFAULT_CALL_SETTINGS,
  INITIAL_MACHINE,
  MAX_TRIES,
  MIN_TRIES,
  THRESHOLDS,
  THRESHOLD_IDS,
  autoActionAfterResult,
  clampTries,
  isRoundOpen,
  judgeRound,
  micRequestFailed,
  nextState,
  notesNeeded,
  octaveShiftToFit,
  parseCallSettings,
  phraseTiming,
  phaseAt,
  resultSummary,
  sanitizePhrase,
  serializeCallSettings,
  showsResult,
  thresholdBand,
  transposePhrase,
  type CallEvent,
  type CallMachine,
  type CallPhrase,
  type CallSettings,
  type PhraseTiming,
  type RoundPhase,
  type RoundResult,
  type ThresholdId,
} from "./call-response";
import { drawCallPlot, readCallPlotTheme } from "./call-response-canvas";
import { buildPhraseGroups } from "./call-response-sources";
import { loadUserExercises, type SavedExercise } from "./exercise-library";
import { INSTRUMENTS, type InstrumentId } from "./instruments";
import { hzToMidi } from "./music-math";
import { fullNoteLabel, type NotationSystem } from "./notation";
import type { PitchHistorySample } from "./pitch-history";
import { recordPracticeActivity } from "./practice-data";
import { CALL_RESPONSE_SETTINGS_KEY } from "./storage-keys";
import "./styles/call-response.css";
import { usePersistedSetting } from "./usePersistedSetting";
import type { VocalGraphSource } from "./vocal-graph";

export type CallAndResponseProps = {
  /**
   * Extra phrases to offer, in concert pitch (what sounds). The melody line
   * and the player's own melodies are wired in here; any list of
   * `CallPhrase` works.
   */
  phrases?: CallPhrase[];
  /** The picker's heading for `phrases`. */
  suppliedLabel?: string;
  /** Which instrument is being played; defaults to the one the tuner is set to. */
  instrumentId?: InstrumentId;
  notation?: NotationSystem;
  saTonic?: number;
  /**
   * The tuner, when the mount has it to hand. Left out, the drill reads all
   * four from the tuner itself (see call-host.ts), which is how the sax lab
   * mounts it.
   */
  listening?: boolean;
  onListen?: () => void;
  micMessage?: string;
  graph?: VocalGraphSource;
  /**
   * "page" sets the drill in its own page-width column (the Tune workspace,
   * where it sits below the tone generator); "embedded", the default, assumes
   * the parent already provides the column.
   */
  variant?: "page" | "embedded";
};

type Run =
  | { kind: "round"; phrase: CallPhrase; timing: PhraseTiming; startTime: number; threshold: ThresholdId }
  | { kind: "preview"; phrase: CallPhrase; timing: PhraseTiming; startTime: number }
  | { kind: "pause"; until: number; action: "advance" | "repeat" };

type ShownResult = { result: RoundResult; frames: PitchHistorySample[]; phrase: CallPhrase };

type Session = { phraseId: string; name: string; notes: string[]; instrumentId: string; attempts: number; matchedOn: number | null; startedAt: number; lastAt: number };

/** A pause after a result before an automatic next round, so the result can be read. */
const AUTO_PAUSE_MS = 2200;
/** Pitch readings can trail the sound by a few frames, so listening reads a little past its end. */
const TAIL_SLACK_MS = 150;
/** Pitch of the one count-in click (concert pitch; a tick, not a note to match). */
const CLICK_MIDI = 96;
const SUPPLIED_LABEL = "Melodies";

const THRESHOLD_HINT: Record<ThresholdId, string> = {
  lenient: "Wide band, most of the notes",
  standard: "Middle band, most of the notes",
  strict: "Narrow band, every note",
};

function tonesFor(target: CallPhrase, timing: PhraseTiming, withClick: boolean): PhraseTone[] {
  const tones: PhraseTone[] = target.notes.map((note, at) => ({
    midi: note.midi,
    startSec: timing.notes[at].startSec,
    durationSec: timing.notes[at].soundingSec,
  }));
  if (withClick) tones.push({ midi: CLICK_MIDI, startSec: timing.phraseSec, durationSec: 0.09, kind: "click" });
  return tones;
}

const subscribeNothing = () => () => undefined;

function useCallHost(): CallHost | null {
  return useSyncExternalStore(subscribeCallHost, getCallHost, () => null);
}

function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export function CallAndResponse(props: CallAndResponseProps) {
  const host = useCallHost();
  const isClient = useIsClient();
  const listening = props.listening !== undefined ? props.listening : host ? host.listening : false;
  const onListen = props.onListen || (host ? host.onListen : undefined);
  const micMessage = props.micMessage !== undefined ? props.micMessage : host ? host.micMessage : "";
  const graph = props.graph || (host ? host.graph : null);
  const instrumentId: InstrumentId = props.instrumentId || (host ? host.instrumentId : "vocal");
  const instrument = INSTRUMENTS[instrumentId];
  const notation: NotationSystem = props.notation || "western";
  const saTonic = props.saTonic || 0;
  const writtenOffset = instrument.writtenOffset;
  const isVoice = instrumentId === "vocal";

  const [settings, setSettings] = usePersistedSetting<CallSettings>(CALL_RESPONSE_SETTINGS_KEY, parseCallSettings, DEFAULT_CALL_SETTINGS, serializeCallSettings);
  const [userExercises, setUserExercises] = useState<SavedExercise[]>([]);
  useEffect(() => {
    const reload = () => setUserExercises(loadUserExercises());
    reload();
    window.addEventListener("bocal-exercise-library", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("bocal-exercise-library", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const groups = useMemo(
    () => buildPhraseGroups(props.phrases || [], userExercises, props.suppliedLabel || SUPPLIED_LABEL),
    [props.phrases, props.suppliedLabel, userExercises],
  );
  const allPhrases = useMemo(() => groups.reduce<CallPhrase[]>((all, group) => all.concat(group.phrases), []), [groups]);

  const [machine, setMachine] = useState<CallMachine>(INITIAL_MACHINE);
  const machineRef = useRef<CallMachine>(INITIAL_MACHINE);
  const [shown, setShown] = useState<ShownResult | null>(null);
  const [phase, setPhase] = useState<RoundPhase | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [notice, setNotice] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef<Run | null>(null);
  const rafRef = useRef<number | null>(null);
  const ticketRef = useRef(0);
  const pendingRef = useRef<"start" | "again" | "next" | null>(null);
  const micAskedRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const roundStartedAtRef = useRef(0);
  const shownRef = useRef<ShownResult | null>(null);
  const viewRef = useRef<{ playingIndex: number | null; live: number | null }>({ playingIndex: null, live: null });

  const index = Math.min(machine.phraseIndex, Math.max(0, allPhrases.length - 1));
  const basePhrase = allPhrases[index];

  const shiftFor = useCallback((base: CallPhrase): number => {
    let fit = 0;
    if (!isVoice) {
      fit = octaveShiftToFit(base, Math.ceil(hzToMidi(instrument.range.minHz)) + 2, Math.floor(hzToMidi(instrument.range.maxHz)) - 4);
    }
    return fit + 12 * settings.octave;
  }, [instrument, isVoice, settings.octave]);

  const phraseFor = useCallback((phraseIndex: number): CallPhrase => {
    const base = allPhrases[Math.min(phraseIndex, allPhrases.length - 1)];
    return transposePhrase(sanitizePhrase(base), shiftFor(base));
  }, [allPhrases, shiftFor]);

  const phrase = useMemo(() => (basePhrase ? transposePhrase(sanitizePhrase(basePhrase), shiftFor(basePhrase)) : null), [basePhrase, shiftFor]);

  // Everything the audio-clock loop and the handlers read lives here, so a
  // render never changes what an already-running round does.
  const latest = useRef({ host, listening, onListen, graph, instrument, writtenOffset, settings, phraseFor, phrase, notation, saTonic, allPhrases });
  useEffect(() => {
    latest.current = { host, listening, onListen, graph, instrument, writtenOffset, settings, phraseFor, phrase, notation, saTonic, allPhrases };
  });

  const dispatch = useCallback((event: CallEvent): CallMachine => {
    const config = {
      phraseCount: latest.current.allPhrases.length,
      tries: clampTries(latest.current.settings.tries),
      autoAdvance: latest.current.settings.autoAdvance,
    };
    const next = nextState(machineRef.current, event, config);
    machineRef.current = next;
    setMachine(next);
    return next;
  }, []);

  // -- The practice log ---------------------------------------------------------------

  const flushSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session || session.attempts === 0) return;
    const tries = `${session.attempts} ${session.attempts === 1 ? "attempt" : "attempts"}`;
    const outcome = session.matchedOn === null ? "not yet matched" : `matched on attempt ${session.matchedOn}`;
    recordPracticeActivity({
      type: session.instrumentId === "vocal" ? "vocal" : "tuning",
      seconds: Math.max(1, (session.lastAt - session.startedAt) / 1000),
      instrumentId: session.instrumentId,
      notes: session.notes,
      label: `Play-along: ${session.name}, ${tries}, ${outcome}`,
    });
  }, []);

  const noteSession = useCallback((shownPhrase: CallPhrase, matched: boolean) => {
    const L = latest.current;
    const now = performance.now();
    let session = sessionRef.current;
    if (!session || session.phraseId !== shownPhrase.id) {
      flushSession();
      session = {
        phraseId: shownPhrase.id,
        name: shownPhrase.name,
        notes: shownPhrase.notes.map((note) => fullNoteLabel(note.midi + L.writtenOffset, "western")),
        instrumentId: L.instrument.id,
        attempts: 0,
        matchedOn: null,
        startedAt: roundStartedAtRef.current || now,
        lastAt: now,
      };
      sessionRef.current = session;
    }
    const attempts = session.attempts + 1;
    sessionRef.current = { ...session, attempts, lastAt: now, matchedOn: matched && session.matchedOn === null ? attempts : session.matchedOn };
  }, [flushSession]);

  // -- Drawing ---------------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const L = latest.current;
    const forPlot = shownRef.current ? shownRef.current.phrase : L.phrase;
    if (!forPlot) return;
    drawCallPlot(canvas, {
      phrase: forPlot,
      writtenOffset: L.writtenOffset,
      notation: L.notation,
      saTonic: L.saTonic,
      bandCents: shownRef.current ? shownRef.current.result.bandCents : thresholdBand(L.settings.threshold),
      result: shownRef.current ? shownRef.current.result : null,
      frames: shownRef.current ? shownRef.current.frames : [],
      live: viewRef.current.live,
      playingIndex: viewRef.current.playingIndex,
      theme: readCallPlotTheme(canvas),
    });
  }, []);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(() => {
    draw();
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  // -- The audio-clock loop --------------------------------------------------------------
  //
  // Sound is queued on the AudioContext clock by the tuner (call-host.ts). This
  // loop only watches that clock, once per animation frame, to move the round
  // along: phrase, count-in, listening, result.

  const loopRef = useRef<() => void>(() => undefined);
  const schedule = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);

  const startRoundRef = useRef<(event: "start" | "again" | "next") => Promise<void>>(async () => undefined);

  const finishListening = useCallback((run: Extract<Run, { kind: "round" }>, clockAudio: number, clockPerf: number) => {
    const L = latest.current;
    const source = L.graph;
    const offset = L.host ? L.host.bufferOffset : 0;
    const endAudio = run.startTime + run.timing.endSec;
    const perfEnd = clockPerf - (clockAudio - endAudio) * 1000;
    const perfStart = perfEnd - run.timing.listenSec * 1000;
    const raw = source ? source.buffer.between(perfStart, perfEnd + TAIL_SLACK_MS) : [];
    // The buffer holds written pitch unless the readout is on concert; the drill judges concert pitch.
    const frames: PitchHistorySample[] = raw.map((sample) => (sample.midi === null ? sample : { ...sample, midi: sample.midi - offset }));
    const result = judgeRound(run.phrase, frames, run.threshold);
    runRef.current = null;
    viewRef.current = { playingIndex: null, live: null };
    shownRef.current = { result, frames, phrase: run.phrase };
    setShown(shownRef.current);
    setPhase(null);
    const next = dispatch({ type: "listenEnded", matched: result.passed });
    noteSession(run.phrase, result.passed);
    const config = { phraseCount: L.allPhrases.length, tries: clampTries(L.settings.tries), autoAdvance: L.settings.autoAdvance };
    const action = autoActionAfterResult(next, config);
    if (action !== "wait") {
      runRef.current = { kind: "pause", until: performance.now() + AUTO_PAUSE_MS, action };
      setPausing(true);
      schedule();
    }
  }, [dispatch, noteSession, schedule]);

  useEffect(() => {
    loopRef.current = () => {
      rafRef.current = null;
      const run = runRef.current;
      if (!run) return;
      const L = latest.current;
      if (run.kind === "pause") {
        if (performance.now() >= run.until) {
          runRef.current = null;
          setPausing(false);
          void startRoundRef.current(run.action === "advance" ? "next" : "again");
          return;
        }
        schedule();
        return;
      }
      const clock = L.host ? L.host.clock() : null;
      if (!clock) {
        schedule();
        return;
      }
      const elapsed = clock.audioSec - run.startTime;
      const where = phaseAt(run.timing, elapsed);
      if (run.kind === "preview") {
        if (elapsed >= run.timing.phraseSec) {
          runRef.current = null;
          viewRef.current.playingIndex = null;
          setPreviewing(false);
          draw();
          return;
        }
        viewRef.current.playingIndex = where.noteIndex;
        draw();
        schedule();
        return;
      }
      if (where.phase === "done") {
        finishListening(run, clock.audioSec, clock.perfMs);
        return;
      }
      setPhase(where.phase);
      viewRef.current.playingIndex = where.phase === "phrase" ? where.noteIndex : null;
      if (where.phase === "listen") {
        if (machineRef.current.state === "playing") dispatch({ type: "phraseEnded" });
        let live: number | null = null;
        if (L.graph) {
          const recent = L.graph.buffer.between(clock.perfMs - 220, clock.perfMs);
          for (let at = recent.length - 1; at >= 0; at -= 1) {
            const sample = recent[at];
            if (sample.midi !== null && sample.cents !== null) {
              live = sample.midi - (L.host ? L.host.bufferOffset : 0) + sample.cents / 100;
              break;
            }
          }
        }
        viewRef.current.live = live;
      } else {
        viewRef.current.live = null;
      }
      draw();
      schedule();
    };
  }, [dispatch, draw, finishListening, schedule]);

  const cancelLoop = useCallback(() => {
    ticketRef.current += 1;
    runRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    viewRef.current = { playingIndex: null, live: null };
    setPhase(null);
    setPausing(false);
    setPreviewing(false);
  }, []);

  const startRound = useCallback(async (event: "start" | "again" | "next") => {
    const L = latest.current;
    if (!L.host) {
      setNotice("The tuner is not ready yet. Try again in a moment.");
      return;
    }
    if (!L.listening) {
      pendingRef.current = event;
      setNotice("Starting the microphone. The phrase plays as soon as it is on.");
      if (!micAskedRef.current && L.onListen) {
        micAskedRef.current = true;
        L.onListen();
      }
      return;
    }
    const before = machineRef.current;
    if (event === "start" ? before.state !== "idle" : !showsResult(before)) return;
    if (event === "next") flushSession();
    const after = dispatch({ type: event });
    if (!isRoundOpen(after)) return;
    const target = L.phraseFor(after.phraseIndex);
    const timing = phraseTiming(target);
    const threshold = L.settings.threshold;
    setNotice("");
    shownRef.current = null;
    setShown(null);
    roundStartedAtRef.current = performance.now();
    ticketRef.current += 1;
    const ticket = ticketRef.current;
    const scheduled = await L.host.schedulePhrase(tonesFor(target, timing, true));
    if (ticket !== ticketRef.current) return;
    if (!scheduled) {
      dispatch({ type: "cancel" });
      setNotice("The phrase could not play. Check the audio output and try again.");
      return;
    }
    runRef.current = { kind: "round", phrase: target, timing, startTime: scheduled.startTime, threshold };
    setPhase("phrase");
    schedule();
  }, [dispatch, flushSession, schedule]);
  useEffect(() => {
    startRoundRef.current = startRound;
  }, [startRound]);

  // Once the microphone comes on, carry out the start the player asked for.
  useEffect(() => {
    if (listening) {
      micAskedRef.current = false;
      const waiting = pendingRef.current;
      pendingRef.current = null;
      if (waiting) void startRoundRef.current(waiting);
    }
  }, [listening]);
  // If the microphone could not start, say why and forget the start that was waiting on it.
  useEffect(() => {
    if (!listening && pendingRef.current && micRequestFailed(micMessage)) {
      micAskedRef.current = false;
      pendingRef.current = null;
      setNotice(micMessage);
    }
  }, [listening, micMessage]);

  const stopRound = useCallback(() => {
    pendingRef.current = null;
    cancelLoop();
    const current = latest.current.host;
    if (current) current.stopPhrase();
    dispatch({ type: "cancel" });
  }, [cancelLoop, dispatch]);

  // If the microphone stops in the middle of a round, drop the round.
  useEffect(() => {
    if (!listening && isRoundOpen(machineRef.current)) {
      stopRound();
      setNotice("The microphone stopped, so that round was dropped.");
    }
  }, [listening, stopRound]);

  useEffect(() => () => {
    ticketRef.current += 1;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const current = latest.current.host;
    if (current) current.stopPhrase();
    flushSession();
  }, [flushSession]);

  const hearPhrase = useCallback(async () => {
    const L = latest.current;
    if (!L.host || !L.phrase || isRoundOpen(machineRef.current)) return;
    if (runRef.current) cancelLoop();
    const target = shownRef.current ? shownRef.current.phrase : L.phrase;
    const timing = phraseTiming(target);
    ticketRef.current += 1;
    const ticket = ticketRef.current;
    setPreviewing(true);
    const scheduled = await L.host.schedulePhrase(tonesFor(target, timing, false));
    if (ticket !== ticketRef.current) return;
    if (!scheduled) {
      setPreviewing(false);
      setNotice("The phrase could not play. Check the audio output and try again.");
      return;
    }
    setNotice("");
    runRef.current = { kind: "preview", phrase: target, timing, startTime: scheduled.startTime };
    schedule();
  }, [cancelLoop, schedule]);

  const finishDrill = useCallback(() => {
    stopRound();
    flushSession();
    shownRef.current = null;
    setShown(null);
    dispatch({ type: "choose", phraseIndex: machineRef.current.phraseIndex });
  }, [dispatch, flushSession, stopRound]);

  const choosePhrase = (phraseIndex: number) => {
    const picked = allPhrases[phraseIndex];
    flushSession();
    shownRef.current = null;
    setShown(null);
    setNotice("");
    dispatch({ type: "choose", phraseIndex });
    if (picked) setSettings((current) => ({ ...current, phraseId: picked.id }));
  };

  // The phrase saved from last time is picked once settings have loaded.
  useEffect(() => {
    const saved = settings.phraseId;
    if (!saved || machineRef.current.state !== "idle" || machineRef.current.attempt !== 0) return;
    const at = allPhrases.findIndex((item) => item.id === saved);
    if (at >= 0 && at !== machineRef.current.phraseIndex) dispatch({ type: "choose", phraseIndex: at });
  }, [settings.phraseId, allPhrases, dispatch]);

  const changeOctave = (octave: -1 | 0 | 1) => {
    if (octave === settings.octave) return;
    flushSession();
    shownRef.current = null;
    setShown(null);
    dispatch({ type: "choose", phraseIndex: machineRef.current.phraseIndex });
    setSettings((current) => ({ ...current, octave }));
  };

  // -- What is on screen ---------------------------------------------------------------

  const open = isRoundOpen(machine);
  const hasResult = showsResult(machine) && shown !== null;
  const shownPhrase = hasResult && shown ? shown.phrase : phrase;
  const writtenLabels = shownPhrase
    ? shownPhrase.notes.map((note) => fullNoteLabel(note.midi + writtenOffset, notation, saTonic))
    : [];
  const noteCount = phrase ? phrase.notes.length : 0;
  const needed = notesNeeded(noteCount, settings.threshold);
  const band = thresholdBand(settings.threshold);
  const tries = clampTries(settings.tries);
  const attemptLabel = machine.attempt > 0 ? `Try ${machine.attempt}${settings.autoAdvance ? ` of ${tries}` : ""}` : "";

  let status = "Pick a phrase and press Start. Bocal plays it, gives you one beat, then listens.";
  if (!isClient || !phrase) status = "";
  else if (pausing) status = shown && shown.result.passed ? "Matched. Moving to the next phrase in a moment." : "Not yet. Trying the phrase again in a moment.";
  else if (previewing) status = "Playing the phrase.";
  else if (open && phase === "count-in") status = "One beat, then it is your turn.";
  else if (open && phase === "listen") status = "Your turn. Sing or play the phrase.";
  else if (open) status = "Listen to the phrase.";
  else if (hasResult && shown) {
    status = resultSummary(shown.result);
    if (shown.result.heard.length === 0) status += " No steady notes were heard. Check the microphone and try a little louder.";
  }

  const plotLabel = phrase
    ? `${phrase.name}: ${writtenLabels.join(", ")}${hasResult && shown ? `. ${resultSummary(shown.result)}` : ""}`
    : "Phrase";

  const panel = (
    <section className="call-response" aria-labelledby="call-response-title" data-state={machine.state} data-testid="call-response">
      <header className="call-response-head">
        <span className="card-kicker"><Ear size={15} /> Play-along · repeat after me</span>
        <h2 id="call-response-title">Hear a phrase, then answer it</h2>
        <p>Bocal plays a short phrase, gives you one beat, then listens. It checks which notes you landed on, and in what order.</p>
      </header>

      <div className="call-response-controls">
        <label className="call-response-field">
          <span>Phrase</span>
          <select
            value={phrase ? allPhrases[index].id : ""}
            disabled={open || pausing}
            onChange={(event) => choosePhrase(allPhrases.findIndex((item) => item.id === event.target.value))}
          >
            {groups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.phrases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="call-response-field">
          <span>Octave</span>
          <select value={settings.octave} disabled={open || pausing} onChange={(event) => changeOctave(Number(event.target.value) as -1 | 0 | 1)}>
            <option value={-1}>One lower</option>
            <option value={0}>{isVoice ? "As written" : "Fitted to range"}</option>
            <option value={1}>One higher</option>
          </select>
        </label>
        <div className="call-response-field" role="group" aria-label="How close the notes must be">
          <span>How close</span>
          <div className="call-response-choice">
            {THRESHOLD_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={settings.threshold === id}
                disabled={open || pausing}
                onClick={() => setSettings((current) => ({ ...current, threshold: id }))}
              >
                {THRESHOLDS[id].label}
              </button>
            ))}
          </div>
          <small>±{band}¢ · {THRESHOLD_HINT[settings.threshold]}{noteCount ? `: ${needed} of ${noteCount} notes` : ""}</small>
        </div>
        <label className="call-response-field">
          <span>Tries per phrase</span>
          <select value={tries} onChange={(event) => setSettings((current) => ({ ...current, tries: clampTries(Number(event.target.value)) }))}>
            {Array.from({ length: MAX_TRIES - MIN_TRIES + 1 }, (_, at) => MIN_TRIES + at).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="call-response-check">
          <input
            type="checkbox"
            checked={settings.autoAdvance}
            onChange={(event) => setSettings((current) => ({ ...current, autoAdvance: event.target.checked }))}
          />
          <span>Move on by itself<small>A matched round goes to the next phrase. An unmatched one repeats until the tries run out.</small></span>
        </label>
      </div>

      <div className="call-response-stage">
        <div className="call-response-plot" role="img" aria-label={plotLabel}>
          <canvas ref={canvasRef} className="call-response-canvas" />
        </div>
        <p className="call-response-plot-note">Each box is one note of the phrase, in order, shown in {writtenOffset !== 0 ? "written" : "sounding"} pitch. The box is as wide as the band you chose. This is not a time axis.</p>

        <div className="call-response-status" role="status" aria-live="polite">
          {attemptLabel && !!status && <small>{attemptLabel}</small>}
          <strong data-outcome={hasResult && shown ? (shown.result.passed ? "matched" : "not-yet") : undefined}>{status}</strong>
        </div>
        {notice && <p className="call-response-notice">{notice}</p>}
        {!notice && micMessage && !listening && <p className="call-response-notice">{micMessage}</p>}

        {shownPhrase && (
          <ol className="call-response-notes" aria-label="Notes of the phrase">
            {shownPhrase.notes.map((note, at) => {
              const verdict = hasResult && shown ? shown.result.notes[at].verdict : null;
              const off = hasResult && shown ? shown.result.notes[at].centsOff : null;
              return (
                <li key={`${at}-${note.midi}`} data-verdict={verdict || undefined}>
                  <b>{writtenLabels[at]}</b>
                  {verdict === "matched" && <span><Check size={13} /> matched{off !== null ? ` · ${off > 0 ? "+" : off < 0 ? "−" : ""}${Math.abs(Math.round(off))}¢` : ""}</span>}
                  {verdict === "missed" && <span><X size={13} /> not yet</span>}
                  {verdict === "octave" && <span><X size={13} /> other octave</span>}
                </li>
              );
            })}
          </ol>
        )}

        {!listening && isClient && (
          <div className="call-response-mic">
            <Mic2 size={15} />
            <span>The microphone is off. Bocal needs it to hear your answer.</span>
            {onListen && <button type="button" className="button secondary" onClick={() => { micAskedRef.current = true; onListen(); }}>Start microphone</button>}
          </div>
        )}

        <div className="call-response-actions">
          {open || pausing ? (
            <button type="button" className="button secondary" onClick={pausing ? finishDrill : stopRound}><Square size={14} /> Stop</button>
          ) : hasResult ? (
            <>
              <button type="button" className="button primary" onClick={() => { cancelLoop(); void startRound("again"); }}><RotateCcw size={15} /> Again</button>
              <button type="button" className="button secondary" onClick={() => { cancelLoop(); void startRound("next"); }}><SkipForward size={15} /> Next</button>
              <button type="button" className="button secondary" onClick={finishDrill}>Done</button>
            </>
          ) : (
            <button type="button" className="button primary" disabled={!phrase} onClick={() => void startRound("start")}><Play size={15} /> Start</button>
          )}
          {!open && !pausing && (
            <button type="button" className="button secondary" disabled={!phrase || previewing || !host} onClick={() => void hearPhrase()}><Volume2 size={15} /> Hear the phrase</button>
          )}
        </div>
      </div>

      <p className="call-response-honesty">
        Bocal listens for pitch and order only. Timing is not judged, so start a note early, late or hold it longer and it still counts. Lenient, standard and strict are Bocal&rsquo;s own settings (bands of ±25, ±15 and ±8 cents; 60%, 80% and all of the notes), not an exam standard. The result is &ldquo;matched&rdquo; or &ldquo;not yet&rdquo;, never a mark. Headphones keep the phrase out of the microphone.
      </p>
    </section>
  );
  return props.variant === "page" ? <div className="content-wrap call-response-wrap">{panel}</div> : panel;
}
