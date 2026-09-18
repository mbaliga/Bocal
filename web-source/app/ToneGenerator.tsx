"use client";

import { Download, Hand, ListMusic, Music2, Pause, Pencil, Play, Plus, Repeat, Save, Trash2, Upload, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForegroundPause } from "./use-foreground-pause";
import "./styles/tone-generator.css";
import { recordPracticeActivity } from "./practice-data";
import { fullNoteLabel, noteName, octaveOf, TONIC_CHOICES, type NotationSystem } from "./notation";
import { targetHzFor, TEMPERAMENT_PROFILES, type TemperamentId } from "./tuning";
import { drainDueTicks, startLookaheadScheduler } from "./audio-scheduler";
import {
  ARPEGGIO_DEGREES,
  chordFrequencies,
  chordMidis,
  chordQualityById,
  CHORD_QUALITIES,
  clampPartnerMidi,
  EXERCISE_PATTERNS,
  exerciseTones,
  type ExerciseTone,
  intervalById,
  intervalPartnerMidi,
  INTERVALS,
  SCALE_DEGREES,
  type ChordQualityId,
  type ChordVoicing,
  type ExercisePatternId,
  type IntervalDirection,
  type IntervalId,
} from "./tone-math";
import {
  allExercises,
  deleteExercise,
  exportExerciseLibrary,
  importExerciseLibraryJson,
  loadUserExercises,
  newExerciseDraft,
  resolveExerciseTones,
  saveUserExercises,
  upsertExercise,
  type SavedExercise,
} from "./exercise-library";

type Waveform = "sine" | "triangle" | "sawtooth" | "square";
type PlayShape = "note" | "interval" | "chord";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const WAVEFORMS: { id: Waveform; label: string }[] = [
  { id: "sine", label: "Pure" },
  { id: "triangle", label: "Soft" },
  { id: "sawtooth", label: "Bright" },
  { id: "square", label: "Reed" },
];
const SHAPES: { id: PlayShape; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "interval", label: "Interval" },
  { id: "chord", label: "Chord" },
];

/** TonalEnergy sustains up to 14 pitches anywhere on the keyboard; matched here. */
const MAX_SUSTAIN_VOICES = 14;
/** Level slider is logarithmic in dBFS, floor -40 dB (near-silent) to -3 dBFS
 * (loud but not clipping a single sine against the limiter). */
const LEVEL_DB_MIN = -40;
const LEVEL_DB_MAX = -3;
/** How close (in semitones) a followed pitch has to move before the follow
 * voice retunes -- absorbs vibrato and tracker jitter without gliding on
 * every reading. */
const FOLLOW_HYSTERESIS_SEMITONES = 0.15;
/** Minimum real seconds a voice must sound before it is worth logging as its
 * own practice entry; anything shorter gets folded into practice time but
 * does not spawn a flood of near-zero-length rows. */
const MIN_LOGGED_SECONDS = 1;

function midiFor(octave: number, noteIndex: number) {
  return (octave + 1) * 12 + noteIndex;
}

type ExerciseTick = { when: number; tick: number; tone: ExerciseTone };

/**
 * Yields one exercise note per tick. `when` carries forward tick by tick --
 * each note's time is the previous note's time plus that note's own
 * seconds-per-note (read fresh from `tempoRef.current`) plus any
 * articulation gap (`gapSecondsRef.current`, an exercise-library field; 0
 * for the plain quick-play controls) -- the same running-clock rule
 * schedulePulse (pulse-schedule.ts) follows, so a live tempo drag only
 * changes the spacing of notes not yet scheduled, never rewrites one already
 * queued on the audio clock. Ends after `pattern.length` ticks unless `loop`
 * is true, in which case it repeats the pattern forever. Both this and
 * schedulePulse's ticks share the same `{ when }` shape, so both drain
 * through the same drainDueTicks/startLookaheadScheduler pair from
 * audio-scheduler.ts.
 */
function* exerciseNoteTicks(
  pattern: ExerciseTone[],
  startTime: number,
  tempoRef: { current: number },
  loop: boolean,
  gapSecondsRef: { current: number },
): Generator<ExerciseTick, void, void> {
  let tick = 0;
  let when = startTime;
  for (;;) {
    if (!loop && tick >= pattern.length) return;
    yield { when, tick, tone: pattern[tick % pattern.length] };
    when += 60 / tempoRef.current + Math.max(0, gapSecondsRef.current);
    tick += 1;
  }
}

/** dBFS <-> linear gain for the logarithmic level slider. */
function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Prefers cancelAndHoldAtTime (keeps whatever value an in-flight ramp is
 * currently at) over cancelScheduledValues (which can leave the param at a
 * stale scheduled value, or -- critically -- strip a same-tick seed event
 * before it ever takes effect). Falls back where the browser lacks it. */
function cancelAndHold(param: AudioParam, context: AudioContext) {
  const now = context.currentTime;
  const withHold = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof withHold.cancelAndHoldAtTime === "function") {
    withHold.cancelAndHoldAtTime(now);
  } else {
    param.cancelScheduledValues(now);
  }
}

type Voice = { oscillators: OscillatorNode[]; gain: GainNode; tones: { midi: number; label: string; hz: number }[]; startedAt: number; label: string };
type SoundingTone = { midi: number; label: string; hz: number };

export function ToneGenerator({
  referenceHz,
  temperament,
  temperamentKeyPc,
  customCents,
  notation,
  saTonic,
  followMidi = null,
}: {
  referenceHz: number;
  temperament: TemperamentId;
  temperamentKeyPc: number;
  /** The 12 custom cent offsets, when temperament === "custom". Optional so
   * callers that predate this prop still degrade to equal-tempered custom. */
  customCents?: number[];
  notation: NotationSystem;
  saTonic: number;
  /** The tuner's currently locked concert MIDI reading, or null when nothing
   * is locked. Passed by the page once the tuner wires it up; the "Follow my
   * pitch" toggle only appears once a caller actually supplies this. */
  followMidi?: number | null;
  // TODO(w2-tuner-structure-and-depth): the tuner's Calibration > Readout
  // toggle now exists (TunerView.tsx) and passes these two through, but
  // nothing here reads them yet -- the note names this generator shows are
  // still whatever its own root/interval/exercise controls pick, not tied to
  // the live tuner's display mode. Wiring that up is package C's call (it
  // owns this file's internals); these props are here so it can without a
  // prop-plumbing change at every call site.
  /** Which pitch space the tuner's readout is currently showing. */
  displayMode?: "written" | "concert";
  /** Semitones from concert to written pitch for the current instrument. */
  writtenOffset?: number;
}) {
  const [octave, setOctave] = useState(4);
  const [waveform, setWaveform] = useState<Waveform>("sine");
  const [levelDb, setLevelDb] = useState(-24);
  const [shape, setShape] = useState<PlayShape>("note");
  const [sustain, setSustain] = useState(false);
  const [intervalId, setIntervalId] = useState<IntervalId>("P5");
  const [intervalDirection, setIntervalDirection] = useState<IntervalDirection>("above");
  const [chordQuality, setChordQuality] = useState<ChordQualityId>("major");
  const [chordVoicing, setChordVoicing] = useState<ChordVoicing>("close");
  const [playingRoots, setPlayingRoots] = useState<Set<number>>(new Set());
  const [soundingTones, setSoundingTones] = useState<SoundingTone[]>([]);
  const [followEnabled, setFollowEnabled] = useState(false);

  const [exercisePattern, setExercisePattern] = useState<ExercisePatternId>("major-scale");
  const [exerciseRootPc, setExerciseRootPc] = useState(0);
  const [exerciseOctave, setExerciseOctave] = useState(4);
  const [exerciseLeapIntervalId, setExerciseLeapIntervalId] = useState<IntervalId>("P5");
  const [exerciseTempo, setExerciseTempo] = useState(80);
  const [exerciseNoteLength, setExerciseNoteLength] = useState(0.8);
  const [exerciseLoop, setExerciseLoop] = useState(true);
  const [exerciseSkipFundamental, setExerciseSkipFundamental] = useState(false);
  const [exercisePlaying, setExercisePlaying] = useState(false);
  const [exerciseCurrentMidi, setExerciseCurrentMidi] = useState<number | null>(null);
  const [exerciseCurrentCents, setExerciseCurrentCents] = useState(0);

  // ---------------------------------------------------------------------
  // Exercise library: saved patterns (six bundled + the player's own),
  // loaded/edited/played through the same exercise player above. See
  // exercise-library.ts for the storage/sanitizing/range-expansion logic.
  // ---------------------------------------------------------------------
  const [userExercises, setUserExercises] = useState<SavedExercise[]>(() => (typeof window === "undefined" ? [] : loadUserExercises()));
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<SavedExercise | null>(null);
  const [libraryMessage, setLibraryMessage] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const library = allExercises(userExercises);
  const activeExercise = activeExerciseId ? library.find((item) => item.id === activeExerciseId) ?? null : null;
  /** 0 for the plain quick-play controls; an exercise's own articulationGapMs once one is loaded. Read by exerciseNoteTicks on every tick, like tempo/noteLength. */
  const exerciseGapSecondsRef = useRef(0);
  useEffect(() => { exerciseGapSecondsRef.current = (activeExercise?.articulationGapMs ?? 0) / 1000; }, [activeExercise]);

  const contextRef = useRef<AudioContext | null>(null);
  const audioEpochRef = useRef(0);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const followVoiceRef = useRef<{ oscillator: OscillatorNode; gain: GainNode; midi: number } | null>(null);

  const volume = dbToGain(levelDb);
  const waveformRef = useRef(waveform);
  const volumeRef = useRef(volume);
  const exerciseTempoRef = useRef(exerciseTempo);
  const exerciseNoteLengthRef = useRef(exerciseNoteLength);
  useEffect(() => { waveformRef.current = waveform; }, [waveform]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { exerciseTempoRef.current = exerciseTempo; }, [exerciseTempo]);
  useEffect(() => { exerciseNoteLengthRef.current = exerciseNoteLength; }, [exerciseNoteLength]);

  const tuningOptions = { referenceHz, temperament, keyPc: temperamentKeyPc, customCents };

  /** The output every voice and the exercise player actually reaches: a
   * shared limiter guards against several held voices summing past 0 dBFS
   * (each voice is already scaled by 1/sqrt(total oscillators), but this is
   * the backstop, not the primary defense). Created lazily alongside the
   * AudioContext and reused for the component's lifetime. */
  const getContext = () => {
    if (!contextRef.current) {
      const context = new AudioContext();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      limiter.connect(context.destination);
      contextRef.current = context;
      limiterRef.current = limiter;
    }
    return contextRef.current;
  };

  useEffect(() => () => {
    audioEpochRef.current += 1;
    voicesRef.current.forEach((voice) => voice.oscillators.forEach((osc) => { try { osc.stop(); } catch { /* already stopped */ } }));
    voicesRef.current.clear();
    if (followVoiceRef.current) { try { followVoiceRef.current.oscillator.stop(); } catch { /* already stopped */ } }
    followVoiceRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    limiterRef.current = null;
  }, []);

  const syncVoiceState = () => {
    const roots = new Set(voicesRef.current.keys());
    const toneMap = new Map<number, SoundingTone>();
    voicesRef.current.forEach((voice) => voice.tones.forEach((tone) => toneMap.set(tone.midi, tone)));
    setPlayingRoots(roots);
    setSoundingTones([...toneMap.values()].sort((a, b) => a.midi - b.midi));
  };

  /** Total oscillators summing into the shared bus right now, across every
   * held voice -- what each individual voice's gain must be scaled against
   * so a multi-tone chord voicing doesn't come out louder than a single
   * note at the same nominal level. */
  const totalOscillators = () => {
    let total = 0;
    voicesRef.current.forEach((voice) => { total += voice.oscillators.length; });
    return total;
  };

  /** Rebalances every active voice's level to `volume / sqrt(totalOscillators)`,
   * so latching several sustained voices -- or a multi-tone chord voicing --
   * at once doesn't clip. Never discards a voice's own seed value: it holds
   * whatever the param is currently at (via cancelAndHold) before ramping,
   * so a voice that was just seeded near-silent starts its ramp from there
   * instead of from the GainNode's default of 1.0. */
  const rescaleVoices = () => {
    const context = contextRef.current;
    if (!context) return;
    const total = totalOscillators();
    if (total === 0) return;
    const perOscillator = Math.max(dbToGain(LEVEL_DB_MIN), volumeRef.current) / Math.sqrt(total);
    voicesRef.current.forEach((voice) => {
      const target = perOscillator * voice.oscillators.length;
      cancelAndHold(voice.gain.gain, context);
      voice.gain.gain.setTargetAtTime(target, context.currentTime, 0.035);
    });
  };

  const tonesForRoot = (rootMidi: number): SoundingTone[] => {
    if (shape === "interval") {
      const semitones = intervalById(intervalId).semitones;
      const partner = clampPartnerMidi(intervalPartnerMidi(rootMidi, semitones, intervalDirection));
      // Under just intonation, key the lookup on the tapped root -- exactly
      // like chordFrequencies -- so an interval sounds pure against the note
      // that was actually tapped instead of the tuner's global key centre
      // (which can otherwise produce a wolf interval with no warning).
      const intervalTuning = temperament === "just" ? { ...tuningOptions, keyPc: (((rootMidi % 12) + 12) % 12) } : tuningOptions;
      return [rootMidi, partner].map((midi) => ({ midi, label: fullNoteLabel(midi, notation, saTonic), hz: targetHzFor(midi, intervalTuning) }));
    }
    if (shape === "chord") {
      const midis = chordMidis(rootMidi, chordQuality, chordVoicing);
      const hz = chordFrequencies(rootMidi, chordQuality, chordVoicing, tuningOptions);
      return midis.map((midi, index) => ({ midi, label: fullNoteLabel(midi, notation, saTonic), hz: hz[index] }));
    }
    return [{ midi: rootMidi, label: fullNoteLabel(rootMidi, notation, saTonic), hz: targetHzFor(rootMidi, tuningOptions) }];
  };

  /** Logs the real held duration of a voice once it stops, coalescing quick
   * taps below MIN_LOGGED_SECONDS into a minimum-length entry rather than
   * either dropping them or letting twenty taps each log a flat 3 seconds. */
  const logVoice = (voice: Voice, context: AudioContext) => {
    const seconds = Math.max(MIN_LOGGED_SECONDS, context.currentTime - voice.startedAt);
    recordPracticeActivity({ type: "tuning", seconds, notes: voice.tones.map((tone) => tone.label), label: voice.label });
  };

  const stopVoice = (rootMidi: number) => {
    const context = contextRef.current;
    const voice = voicesRef.current.get(rootMidi);
    if (!context || !voice) return;
    cancelAndHold(voice.gain.gain, context);
    voice.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.035);
    const stopAt = context.currentTime + 0.13;
    voice.oscillators.forEach((osc) => { osc.stop(stopAt); osc.onended = () => { try { osc.disconnect(); } catch { /* already gone */ } }; });
    voice.gain.gain.setValueAtTime(0.0001, stopAt + 0.01);
    voicesRef.current.delete(rootMidi);
    logVoice(voice, context);
    syncVoiceState();
    rescaleVoices();
  };

  const stopAllVoices = () => {
    [...voicesRef.current.keys()].forEach(stopVoice);
  };

  useForegroundPause(() => {
    audioEpochRef.current += 1;
    stopAllVoices();
    setExercisePlaying(false);
    setFollowEnabled(false);
    setSustain(false);
    const context = contextRef.current;
    if (context?.state === "running") void context.suspend().catch(() => undefined);
  });

  const playVoice = async (rootMidi: number) => {
    const epoch = audioEpochRef.current;
    const context = getContext();
    const limiter = limiterRef.current!;
    if (context.state === "suspended") { try { await context.resume(); } catch { return; } }
    if (document.hidden || epoch !== audioEpochRef.current || context.state === "closed") return;

    const tones = tonesForRoot(rootMidi);
    const gain = context.createGain();
    // Seed the *intrinsic* value, not a scheduled event: a scheduled
    // setValueAtTime seed can be wiped out by a cancel call that lands in
    // the same render quantum (rescaleVoices, called right below), which is
    // exactly what produced a ~0 dBFS pop on every tap. Setting .value
    // directly is not a scheduled event, so cancelAndHold never touches it,
    // and the very first setTargetAtTime ramps up *from* this seed instead
    // of from the GainNode's default of 1.0.
    gain.gain.value = 0.0001;
    gain.connect(limiter);
    const label = shape === "chord" ? `${chordQualityById(chordQuality).label} chord` : shape === "interval" ? `${intervalById(intervalId).label} interval` : "Reference tone";
    const voice: Voice = { oscillators: [], gain, tones, startedAt: context.currentTime, label };
    // Reserve the slot synchronously, before the oscillators are built, so a
    // second tap on the same key (or a second tap anywhere, while the first
    // await above is still pending on a suspended context) can never
    // overwrite a voice whose oscillators have already started and are
    // otherwise unreachable.
    voicesRef.current.set(rootMidi, voice);
    voice.oscillators = tones.map((tone) => {
      const oscillator = context.createOscillator();
      oscillator.type = waveformRef.current;
      oscillator.frequency.value = tone.hz;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    syncVoiceState();
    rescaleVoices();
  };

  const tapKey = (rootMidi: number) => {
    if (sustain) {
      if (voicesRef.current.has(rootMidi)) { stopVoice(rootMidi); return; }
      if (voicesRef.current.size >= MAX_SUSTAIN_VOICES) return;
      void playVoice(rootMidi);
      return;
    }
    stopAllVoices();
    void playVoice(rootMidi);
  };

  // Turning Hold off with notes still ringing releases them -- sustain is a
  // mode you opt into, not a residue that outlives the toggle.
  useEffect(() => {
    if (!sustain) stopAllVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sustain]);

  // A held note tracks the level slider live; a fresh tap already picks up
  // waveform/level at play time, so only the rescale needs to run here.
  useEffect(() => {
    rescaleVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelDb]);

  // ---------------------------------------------------------------------
  // "Follow my pitch": while enabled and a lock is supplied, one dedicated
  // voice glides to the followed note instead of retriggering, with a small
  // semitone hysteresis so vibrato/jitter in the tracker reading doesn't
  // make the tone flutter. The mic will hear this tone if it is loud enough
  // to leak into the room, so this is meant for headphone practice or a
  // quiet room -- not a claim that the two can run cleanly at once.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!followEnabled || followMidi === null || followMidi === undefined) {
      if (followVoiceRef.current) {
        const context = contextRef.current;
        const { oscillator, gain } = followVoiceRef.current;
        if (context) {
          cancelAndHold(gain.gain, context);
          gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.035);
          try { oscillator.stop(context.currentTime + 0.15); } catch { /* already stopped */ }
        } else {
          try { oscillator.stop(); } catch { /* already stopped */ }
        }
        followVoiceRef.current = null;
      }
      return;
    }
    const context = getContext();
    const limiter = limiterRef.current!;
    if (context.state === "suspended") void context.resume();
    const hz = targetHzFor(followMidi, tuningOptions);
    const existing = followVoiceRef.current;
    if (existing && Math.abs(existing.midi - followMidi) < FOLLOW_HYSTERESIS_SEMITONES) {
      return;
    }
    if (existing) {
      existing.oscillator.frequency.setTargetAtTime(hz, context.currentTime, 0.02);
      existing.midi = followMidi;
      return;
    }
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.connect(limiter);
    const oscillator = context.createOscillator();
    oscillator.type = waveformRef.current;
    oscillator.frequency.value = hz;
    oscillator.connect(gain);
    oscillator.start();
    gain.gain.setTargetAtTime(Math.max(dbToGain(LEVEL_DB_MIN), volumeRef.current), context.currentTime, 0.05);
    followVoiceRef.current = { oscillator, gain, midi: followMidi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followEnabled, followMidi, referenceHz, temperament, temperamentKeyPc, customCents]);

  // ---------------------------------------------------------------------
  // Exercise player: schedules every note ahead on the audio clock, exactly
  // like the metronome in PracticeTools.tsx. The on-screen highlight rides a
  // plain visual timer -- fine here, since a few milliseconds of jitter in
  // when a key lights up is invisible, unlike the note's actual timing.
  //
  // Level, waveform, tempo and note length are read from refs at schedule
  // time rather than closed over, so dragging one of those sliders mid-run
  // does not tear the scheduler down and restart the whole pattern from the
  // root with an abrupt cut -- it only changes what the *next* scheduled
  // note uses.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!exercisePlaying) return undefined;
    const context = getContext();
    const limiter = limiterRef.current!;
    if (context.state === "suspended") void context.resume();

    const rootMidi = midiFor(exerciseOctave, exerciseRootPc);
    // A loaded library exercise's own pattern/root/range/writtenOffset take
    // over pattern generation entirely (resolveExerciseTones folds in its
    // saved range expansion and written-to-concert transposition); touching
    // any of the quick controls below clears activeExerciseId and falls back
    // to the ad-hoc root/pattern/leap/skip-fundamental combination.
    const pattern = activeExercise
      ? resolveExerciseTones(activeExercise, tuningOptions)
      : exerciseTones(rootMidi, exercisePattern, tuningOptions, {
        intervalSemitones: intervalById(exerciseLeapIntervalId).semitones,
        skipFundamental: exerciseSkipFundamental,
      });
    const startTime = context.currentTime + 0.06;
    const liveNodes = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
    const visualTimers: number[] = [];
    let cancelled = false;

    const scheduleNote = (tone: (typeof pattern)[number], when: number) => {
      const secondsPerNote = 60 / exerciseTempoRef.current;
      const noteDuration = Math.max(0.08, secondsPerNote * exerciseNoteLengthRef.current);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveformRef.current;
      oscillator.frequency.value = tone.hz;
      const level = Math.max(dbToGain(LEVEL_DB_MIN), volumeRef.current);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level, when + 0.02);
      gain.gain.setValueAtTime(level, Math.max(when + 0.02, when + noteDuration - 0.03));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + noteDuration);
      oscillator.connect(gain).connect(limiter);
      oscillator.start(when);
      oscillator.stop(when + noteDuration + 0.02);
      const node = { oscillator, gain };
      liveNodes.add(node);
      oscillator.onended = () => {
        liveNodes.delete(node);
        try { oscillator.disconnect(); gain.disconnect(); } catch { /* already gone */ }
      };
      return noteDuration;
    };

    // The generator itself is the same shape schedulePulse yields (a `when`
    // per tick), so it drains through the same drainDueTicks/
    // startLookaheadScheduler pair PulseView's metronome uses -- see
    // audio-scheduler.ts. tempoRef is read fresh inside the generator on
    // every yield, not captured once, so a live tempo drag changes only the
    // *next* not-yet-scheduled note's timing.
    const iterator = exerciseNoteTicks(pattern, startTime, exerciseTempoRef, exerciseLoop, exerciseGapSecondsRef);
    let pending = iterator.next();
    // startLookaheadScheduler's first wake runs synchronously, inside the
    // call below, before it has anything to assign to a local `const` --
    // this mutable holder is what onWake calls .stop() through once the
    // pattern (non-looping) is exhausted.
    let schedulerHandle: ReturnType<typeof startLookaheadScheduler> | null = null;

    schedulerHandle = startLookaheadScheduler({
      now: () => context.currentTime,
      onWake: (scheduleAhead) => {
        pending = drainDueTicks(iterator, pending, context.currentTime + scheduleAhead, (item) => {
          const noteDuration = scheduleNote(item.tone, item.when);
          const delayMs = Math.max(0, (item.when - context.currentTime) * 1000);
          visualTimers.push(window.setTimeout(() => {
            if (cancelled) return;
            setExerciseCurrentMidi(item.tone.midi);
            setExerciseCurrentCents(item.tone.cents);
          }, delayMs));
          if (!exerciseLoop && item.tick === pattern.length - 1) {
            visualTimers.push(
              window.setTimeout(() => {
                if (cancelled) return;
                setExercisePlaying(false);
                setExerciseCurrentMidi(null);
              }, delayMs + noteDuration * 1000 + 20),
            );
          }
        });
        if (pending.done) schedulerHandle?.stop();
      },
    });

    return () => {
      cancelled = true;
      schedulerHandle?.stop();
      visualTimers.forEach(window.clearTimeout);
      const now = context.currentTime;
      liveNodes.forEach(({ oscillator, gain }) => {
        try {
          cancelAndHold(gain.gain, context);
          gain.gain.setTargetAtTime(0.0001, now, 0.015);
          oscillator.stop(now + 0.04);
        } catch { /* already stopped */ }
      });
      setExerciseCurrentMidi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeExercise itself (an object) isn't a dependency; activeExerciseId plus its updatedAt cover every field that can actually change its resolved tones.
  }, [exercisePlaying, exercisePattern, exerciseRootPc, exerciseOctave, exerciseLeapIntervalId, exerciseSkipFundamental, exerciseLoop, activeExerciseId, activeExercise?.updatedAt, referenceHz, temperament, temperamentKeyPc, customCents]);

  // ---------------------------------------------------------------------
  // Exercise library handlers: loading a saved exercise into the player
  // above, the small create/edit form, delete, and export/import through
  // the same save-file path takes/analysis exports use.
  // ---------------------------------------------------------------------
  const detachFromLibrary = () => setActiveExerciseId(null);

  const loadExercise = (exercise: SavedExercise) => {
    setExercisePattern(exercise.pattern);
    setExerciseRootPc(((exercise.rootMidi % 12) + 12) % 12);
    setExerciseOctave(octaveOf(exercise.rootMidi));
    if (exercise.leapIntervalSemitones !== undefined) {
      setExerciseLeapIntervalId(INTERVALS.find((interval) => interval.semitones === exercise.leapIntervalSemitones)?.id ?? "P5");
    }
    setExerciseSkipFundamental(exercise.skipFundamental === true);
    setExerciseTempo(exercise.tempo);
    setExerciseNoteLength(exercise.noteLength);
    setExerciseLoop(exercise.loop);
    setActiveExerciseId(exercise.id);
    setEditorDraft(null);
    setLibraryMessage("");
  };

  const openNewExercise = () => setEditorDraft(newExerciseDraft());
  const openEditExercise = (exercise: SavedExercise) => setEditorDraft(
    exercise.builtIn
      ? { ...exercise, id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${exercise.name} (copy)`, builtIn: false }
      : { ...exercise },
  );
  const closeEditor = () => setEditorDraft(null);
  const updateDraft = (patch: Partial<SavedExercise>) => setEditorDraft((current) => (current ? { ...current, ...patch } : current));

  const saveEditorDraft = () => {
    if (!editorDraft) return;
    const name = editorDraft.name.trim();
    if (!name) return;
    const saved = { ...editorDraft, name: name.slice(0, 60) };
    const next = upsertExercise(userExercises, saved);
    setUserExercises(next);
    saveUserExercises(next);
    const stored = next.find((item) => item.id === saved.id) ?? saved;
    loadExercise(stored);
  };

  const removeExercise = (id: string) => {
    const next = deleteExercise(userExercises, id);
    setUserExercises(next);
    saveUserExercises(next);
    if (activeExerciseId === id) setActiveExerciseId(null);
    if (editorDraft?.id === id) setEditorDraft(null);
  };

  const handleExport = () => {
    void exportExerciseLibrary(userExercises).then(() =>
      setLibraryMessage(userExercises.length ? "Exported your saved exercises." : "Nothing of your own saved yet -- the six built-ins don't need exporting."),
    );
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text()
      .then((raw) => {
        const { imported, rejectedCount } = importExerciseLibraryJson(raw);
        if (imported.length === 0) {
          setLibraryMessage(rejectedCount > 0 ? "That file didn't contain any exercises Bocal could read." : "That file didn't contain any exercises.");
          return;
        }
        const next = imported.reduce((list, exercise) => upsertExercise(list, exercise), userExercises);
        setUserExercises(next);
        saveUserExercises(next);
        setLibraryMessage(`Imported ${imported.length} exercise${imported.length === 1 ? "" : "s"}${rejectedCount ? `, skipped ${rejectedCount} that didn't parse` : ""}.`);
      })
      .catch(() => setLibraryMessage("Could not read that file."));
  };

  const exerciseRoot = midiFor(exerciseOctave, exerciseRootPc);
  const displayOctave = exercisePlaying && exerciseCurrentMidi !== null ? octaveOf(exerciseCurrentMidi) : octave;
  const soundingMidiSet = new Set(soundingTones.map((tone) => tone.midi));

  const notes = NOTE_NAMES.map((_, index) => {
    const midi = midiFor(displayOctave, index);
    return { midi, name: NOTE_NAMES[index], label: noteName(midi, notation, saTonic), hz: targetHzFor(midi, tuningOptions) };
  });

  const activeVoiceCount = playingRoots.size;
  const isAnythingSounding = activeVoiceCount > 0;
  const isJustChord = shape === "chord" && temperament === "just";
  const temperamentLabel = TEMPERAMENT_PROFILES[temperament]?.label ?? temperament;

  return (
    <section className="tone-generator-card" aria-labelledby="tone-generator-title">
      <header className="tone-generator-head">
        <div><span className="card-kicker"><Volume2 size={14} /> Tone generator</span><h2 id="tone-generator-title">Hear any target.</h2><p>Use a clean reference tone for a note, interval or chord shape. The synth voice follows your calibration.</p></div>
        <button className="tone-stop" onClick={stopAllVoices} disabled={!isAnythingSounding}><Pause size={14} /> {sustain ? "Release all" : "Stop"}</button>
      </header>

      <div className="tone-controls">
        <label className="tone-octave-field">
          <span>Octave</span>
          <div className="tone-octave-stepper">
            <button type="button" onClick={() => setOctave((value) => Math.max(1, value - 1))} disabled={octave <= 1} aria-label="Octave down">−</button>
            <output>{octave}</output>
            <button type="button" onClick={() => setOctave((value) => Math.min(8, value + 1))} disabled={octave >= 8} aria-label="Octave up">+</button>
          </div>
        </label>
        <label><span>Voice</span><select value={waveform} onChange={(event) => setWaveform(event.target.value as Waveform)}>{WAVEFORMS.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>
        <label className="tone-volume"><span>Level</span><input type="range" min={LEVEL_DB_MIN} max={LEVEL_DB_MAX} step="1" value={levelDb} onChange={(event) => setLevelDb(Number(event.target.value))} aria-label="Reference tone level" /></label>
        {followMidi !== null && followMidi !== undefined && (
          <label className="tone-follow-toggle">
            <input type="checkbox" checked={followEnabled} onChange={(event) => setFollowEnabled(event.target.checked)} />
            Follow my pitch
          </label>
        )}
      </div>

      <div className="tone-shape-row">
        <div className="notation-switch tone-shape-switch" role="tablist" aria-label="What tapping a key sounds">
          {SHAPES.map((option) => (
            <button key={option.id} type="button" role="tab" aria-selected={shape === option.id} className={shape === option.id ? "is-active" : ""} onClick={() => setShape(option.id)}>{option.label}</button>
          ))}
        </div>
        <label className="tone-sustain-toggle">
          <input type="checkbox" checked={sustain} onChange={(event) => setSustain(event.target.checked)} />
          <Hand size={13} /> Hold
          {sustain && <small>{activeVoiceCount}/{MAX_SUSTAIN_VOICES}</small>}
        </label>
      </div>

      {shape === "interval" && (
        <div className="tone-shape-options">
          <label><span>Interval</span>
            <select value={intervalId} onChange={(event) => setIntervalId(event.target.value as IntervalId)}>
              {INTERVALS.map((interval) => <option key={interval.id} value={interval.id}>{interval.label}</option>)}
            </select>
          </label>
          <div className="notation-switch">
            <button type="button" className={intervalDirection === "above" ? "is-active" : ""} onClick={() => setIntervalDirection("above")}>Above</button>
            <button type="button" className={intervalDirection === "below" ? "is-active" : ""} onClick={() => setIntervalDirection("below")}>Below</button>
          </div>
        </div>
      )}

      {shape === "chord" && (
        <div className="tone-shape-options">
          <label><span>Quality</span>
            <select value={chordQuality} onChange={(event) => setChordQuality(event.target.value as ChordQualityId)}>
              {CHORD_QUALITIES.map((quality) => <option key={quality.id} value={quality.id}>{quality.label}</option>)}
            </select>
          </label>
          <div className="notation-switch">
            <button type="button" className={chordVoicing === "close" ? "is-active" : ""} onClick={() => setChordVoicing("close")}>Close</button>
            <button type="button" className={chordVoicing === "root" ? "is-active" : ""} onClick={() => setChordVoicing("root")}>Root</button>
          </div>
        </div>
      )}
      {shape === "chord" && (
        <p className="tone-just-note">
          {isJustChord
            ? "Beat-free: with just intonation active, every tone in this chord is tuned to a pure low-integer ratio over its own root, not your calibrated key centre."
            : temperament === "equal"
              ? "Equal temperament: the chord's tones are plain equal-tempered, same as the rest of the tuner."
              : "This chord follows your calibrated temperament and key centre, same as any other note here. Switch to just intonation for a beat-free chord."}
        </p>
      )}
      {shape === "interval" && temperament === "just" && (
        <p className="tone-just-note">Beat-free: with just intonation active, this interval is tuned pure around the tapped root.</p>
      )}

      <p className="tone-sounding" aria-live="polite">
        {soundingTones.length > 0
          ? soundingTones.map((tone) => `${tone.label} · ${tone.hz.toFixed(1)} Hz`).join("  —  ")
          : "Tap a key to hear it."}
      </p>

      <div className="tone-keyboard" aria-label={`${displayOctave} octave reference keyboard`}>
        {notes.map((item) => {
          const isSounding = soundingMidiSet.has(item.midi);
          const isCurrentExerciseNote = exercisePlaying && exerciseCurrentMidi === item.midi;
          const classes = [isSounding ? "is-playing" : "", isCurrentExerciseNote ? "is-exercise-current" : ""].filter(Boolean).join(" ");
          return (
            <button key={item.midi} className={classes} onClick={() => tapKey(item.midi)} title={`${item.label} · ${item.hz.toFixed(1)} Hz`}>
              <span>{item.name}</span><small>{item.label}</small>{isSounding ? <Pause size={12} /> : <Play size={12} />}
            </button>
          );
        })}
      </div>

      <p className="local-note"><Music2 size={13} /> Synthetic reference voice · {referenceHz.toFixed(1)} Hz A · {temperamentLabel} temperament</p>

      <div className="tone-exercise">
        <header className="tone-exercise-head">
          <span className="card-kicker"><ListMusic size={13} /> Exercise player</span>
          <p>{EXERCISE_PATTERNS.find((pattern) => pattern.id === exercisePattern)?.description}</p>
        </header>

        {activeExercise && (
          <p className="tone-exercise-library-active" role="status">
            <ListMusic size={13} /> Playing &ldquo;{activeExercise.name}&rdquo; from your library.
            <button type="button" onClick={detachFromLibrary}><X size={12} /> Use quick controls instead</button>
          </p>
        )}
        <div className="tone-exercise-controls">
          <label><span>Pattern</span>
            <select value={exercisePattern} onChange={(event) => { detachFromLibrary(); setExercisePattern(event.target.value as ExercisePatternId); }}>
              {EXERCISE_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
            </select>
          </label>
          <label><span>Root</span>
            <select value={exerciseRootPc} onChange={(event) => { detachFromLibrary(); setExerciseRootPc(Number(event.target.value)); }}>
              {TONIC_CHOICES.map((choice) => <option key={choice.pc} value={choice.pc}>{choice.name}</option>)}
            </select>
          </label>
          <label><span>Octave</span>
            <select value={exerciseOctave} onChange={(event) => { detachFromLibrary(); setExerciseOctave(Number(event.target.value)); }}>
              {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {exercisePattern === "interval-leaps" && (
            <label><span>Leap</span>
              <select value={exerciseLeapIntervalId} onChange={(event) => { detachFromLibrary(); setExerciseLeapIntervalId(event.target.value as IntervalId); }}>
                {INTERVALS.map((interval) => <option key={interval.id} value={interval.id}>{interval.label}</option>)}
              </select>
            </label>
          )}
          {exercisePattern === "harmonic-series" && (
            <label className="tone-skip-fundamental">
              <input type="checkbox" checked={exerciseSkipFundamental} onChange={(event) => { detachFromLibrary(); setExerciseSkipFundamental(event.target.checked); }} />
              Skip fundamental
            </label>
          )}
          <label><span>Tempo</span>
            <input type="range" min="30" max="160" step="1" value={exerciseTempo} onChange={(event) => setExerciseTempo(Number(event.target.value))} aria-label="Exercise tempo in beats per minute" />
            <small>{exerciseTempo} bpm</small>
          </label>
          <label><span>Note length</span>
            <input type="range" min="0.3" max="1" step="0.05" value={exerciseNoteLength} onChange={(event) => setExerciseNoteLength(Number(event.target.value))} aria-label="Note length" />
            <small>{exerciseNoteLength >= 0.9 ? "Legato" : exerciseNoteLength <= 0.45 ? "Staccato" : "Medium"}</small>
          </label>
        </div>

        <div className="tone-exercise-actions">
          <button type="button" className="tone-exercise-play" onClick={() => setExercisePlaying((value) => !value)}>
            {exercisePlaying ? <Pause size={14} /> : <Play size={14} />} {exercisePlaying ? "Stop" : "Play"}
          </button>
          <button type="button" className={`tone-exercise-loop${exerciseLoop ? " is-active" : ""}`} onClick={() => setExerciseLoop((value) => !value)} aria-pressed={exerciseLoop}>
            <Repeat size={13} /> Loop
          </button>
          <span className="tone-exercise-status">
            {exercisePlaying && exerciseCurrentMidi !== null
              ? `Now: ${fullNoteLabel(exerciseCurrentMidi, notation, saTonic)}${exercisePattern === "harmonic-series" && Math.abs(exerciseCurrentCents) >= 1 ? ` (${exerciseCurrentCents > 0 ? "+" : ""}${exerciseCurrentCents.toFixed(0)}¢)` : ""}`
              : `Starts on ${fullNoteLabel(exerciseRoot, notation, saTonic)}`}
          </span>
        </div>

        <div className="tone-exercise-library">
          <header className="tone-exercise-library-head">
            <span className="card-kicker"><ListMusic size={13} /> Exercise library</span>
            <p>Six exercises Bocal put together to start from, plus anything you save. Pick one to load it above, or build your own.</p>
          </header>

          <div className="tone-exercise-library-chips">
            {library.map((exercise) => (
              <span key={exercise.id} className="exercise-chip-wrap">
                <button
                  type="button"
                  className={`exercise-chip${activeExerciseId === exercise.id ? " is-active" : ""}`}
                  onClick={() => loadExercise(exercise)}
                >
                  <strong>{exercise.name}</strong>
                  <small>{exercise.tempo} bpm{exercise.loop ? " · loops" : ""}{exercise.builtIn ? "" : " · yours"}</small>
                </button>
                <button type="button" className="chip-edit" aria-label={`Edit ${exercise.name}`} onClick={() => openEditExercise(exercise)}><Pencil size={12} /></button>
                {!exercise.builtIn && (
                  <button type="button" className="chip-delete" aria-label={`Delete ${exercise.name}`} onClick={() => removeExercise(exercise.id)}><Trash2 size={12} /></button>
                )}
              </span>
            ))}
          </div>

          <div className="tone-exercise-library-actions">
            <button type="button" onClick={openNewExercise}><Plus size={14} /> New exercise</button>
            <button type="button" onClick={handleExport}><Download size={14} /> Export mine</button>
            <button type="button" onClick={() => importInputRef.current?.click()}><Upload size={14} /> Import</button>
            <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImportFile} />
          </div>
          {libraryMessage && <p className="tone-exercise-library-message" role="status">{libraryMessage}</p>}

          {editorDraft && (
            <ExerciseEditor
              draft={editorDraft}
              notation={notation}
              saTonic={saTonic}
              onChange={updateDraft}
              onSave={saveEditorDraft}
              onCancel={closeEditor}
              onDelete={!editorDraft.builtIn && userExercises.some((item) => item.id === editorDraft.id) ? () => removeExercise(editorDraft.id) : undefined}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A small create/edit form for one saved exercise -- kept as its own
 * component (rather than inlined into ToneGenerator's already-long render)
 * so its many pattern-conditional fields don't crowd the exercise player
 * above it. Every field writes straight back to the draft object through
 * onChange; ToneGenerator holds the actual draft state and only commits it
 * to storage (via exercise-library.ts's upsertExercise) when Save is
 * pressed, so Cancel simply discards the edit-in-progress.
 */
function ExerciseEditor({
  draft,
  notation,
  saTonic,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: SavedExercise;
  notation: NotationSystem;
  saTonic: number;
  onChange: (patch: Partial<SavedExercise>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const rootOctave = octaveOf(draft.rootMidi);
  const rootPc = ((draft.rootMidi % 12) + 12) % 12;
  const setRoot = (pc: number, octave: number) => onChange({ rootMidi: midiFor(octave, pc) });
  // Matches exercise-library.ts's own rangeExpands: only these pattern kinds
  // actually repeat across the saved range when played, so the range editor
  // (and the "repeats every" step picker) only appear where the range would
  // do something -- harmonic-series, interval-leaps and custom already carry
  // their own length via partials/repeats/the note list itself.
  const rangeMatters = draft.pattern === "chromatic" || draft.pattern === "major-scale" || draft.pattern in SCALE_DEGREES || draft.pattern in ARPEGGIO_DEGREES;
  const rangeLowOctave = octaveOf(draft.rangeLowMidi);
  const rangeLowPc = ((draft.rangeLowMidi % 12) + 12) % 12;
  const rangeHighOctave = octaveOf(draft.rangeHighMidi);
  const rangeHighPc = ((draft.rangeHighMidi % 12) + 12) % 12;

  return (
    <div className="exercise-editor" role="group" aria-label={draft.name ? `Editing ${draft.name}` : "New exercise"}>
      <div className="exercise-editor-row">
        <label className="exercise-editor-name"><span>Name</span><input value={draft.name} onChange={(event) => onChange({ name: event.target.value.slice(0, 60) })} placeholder="Name this exercise" maxLength={60} aria-label="Exercise name" /></label>
        <label><span>Pattern</span>
          <select value={draft.pattern} onChange={(event) => onChange({ pattern: event.target.value as ExercisePatternId })}>
            {EXERCISE_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
          </select>
        </label>
      </div>

      <div className="exercise-editor-row">
        <label><span>Root (written)</span>
          <span className="exercise-editor-note-pair">
            <select value={rootPc} onChange={(event) => setRoot(Number(event.target.value), rootOctave)} aria-label="Root note">
              {TONIC_CHOICES.map((choice) => <option key={choice.pc} value={choice.pc}>{choice.name}</option>)}
            </select>
            <select value={rootOctave} onChange={(event) => setRoot(rootPc, Number(event.target.value))} aria-label="Root octave">
              {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </span>
        </label>
        <label><span>Transposition</span>
          <input type="number" inputMode="numeric" min={-24} max={24} value={draft.writtenOffset} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange({ writtenOffset: Math.min(24, Math.max(-24, Math.round(next))) }); }} aria-label="Semitones from written to concert pitch" />
          <small>{draft.writtenOffset === 0 ? "Concert pitch" : `${draft.writtenOffset > 0 ? "+" : ""}${draft.writtenOffset} semitones written → concert`}</small>
        </label>
      </div>

      {rangeMatters && (
        <div className="exercise-editor-row">
          <label><span>Range low (written)</span>
            <span className="exercise-editor-note-pair">
              <select value={rangeLowPc} onChange={(event) => onChange({ rangeLowMidi: midiFor(rangeLowOctave, Number(event.target.value)) })} aria-label="Range low note">
                {TONIC_CHOICES.map((choice) => <option key={choice.pc} value={choice.pc}>{choice.name}</option>)}
              </select>
              <select value={rangeLowOctave} onChange={(event) => onChange({ rangeLowMidi: midiFor(Number(event.target.value), rangeLowPc) })} aria-label="Range low octave">
                {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </span>
          </label>
          <label><span>Range high (written)</span>
            <span className="exercise-editor-note-pair">
              <select value={rangeHighPc} onChange={(event) => onChange({ rangeHighMidi: midiFor(rangeHighOctave, Number(event.target.value)) })} aria-label="Range high note">
                {TONIC_CHOICES.map((choice) => <option key={choice.pc} value={choice.pc}>{choice.name}</option>)}
              </select>
              <select value={rangeHighOctave} onChange={(event) => onChange({ rangeHighMidi: midiFor(Number(event.target.value), rangeHighPc) })} aria-label="Range high octave">
                {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </span>
          </label>
        </div>
      )}

      {rangeMatters && (
        <label className="exercise-editor-repeat-step"><span>Repeats every</span>
          <select value={draft.repeatStepSemitones} onChange={(event) => onChange({ repeatStepSemitones: Number(event.target.value) })}>
            <option value={12}>Octave (12 semitones)</option>
            <option value={7}>Fifth (7 semitones)</option>
            <option value={5}>Fourth (5 semitones)</option>
            <option value={4}>Major 3rd (4 semitones)</option>
          </select>
        </label>
      )}

      {draft.pattern === "interval-leaps" && (
        <div className="exercise-editor-row">
          <label><span>Leap</span>
            <select value={INTERVALS.find((interval) => interval.semitones === draft.leapIntervalSemitones)?.id ?? "P5"} onChange={(event) => onChange({ leapIntervalSemitones: intervalById(event.target.value as IntervalId).semitones })}>
              {INTERVALS.map((interval) => <option key={interval.id} value={interval.id}>{interval.label}</option>)}
            </select>
          </label>
          <label><span>Repeats</span>
            <input type="number" inputMode="numeric" min={1} max={16} value={draft.leapRepeats ?? 4} onChange={(event) => { const next = Math.round(Number(event.target.value)); if (Number.isFinite(next)) onChange({ leapRepeats: Math.min(16, Math.max(1, next)) }); }} aria-label="Leap repeats" />
          </label>
        </div>
      )}

      {draft.pattern === "harmonic-series" && (
        <label className="tone-skip-fundamental">
          <input type="checkbox" checked={draft.skipFundamental === true} onChange={(event) => onChange({ skipFundamental: event.target.checked })} />
          Skip fundamental
        </label>
      )}

      {draft.pattern === "custom" && (
        <label className="exercise-editor-custom-notes"><span>Note list (in order)</span>
          <textarea
            value={(draft.customNotes ?? []).join(" ")}
            onChange={(event) => onChange({ customNotes: event.target.value.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean).slice(0, 64) })}
            placeholder="C4 E4 G4 C5"
            aria-label="Custom note list"
          />
          <small>Note names like C4, F#5, Bb3 -- separated by spaces or commas. Unrecognised entries are dropped when you save.</small>
        </label>
      )}

      <div className="exercise-editor-row">
        <label><span>Tempo</span>
          <input type="range" min="30" max="208" step="1" value={draft.tempo} onChange={(event) => onChange({ tempo: Number(event.target.value) })} aria-label="Exercise tempo" />
          <small>{draft.tempo} bpm</small>
        </label>
        <label><span>Note length</span>
          <input type="range" min="0.2" max="1" step="0.05" value={draft.noteLength} onChange={(event) => onChange({ noteLength: Number(event.target.value) })} aria-label="Note length" />
          <small>{draft.noteLength >= 0.9 ? "Legato" : draft.noteLength <= 0.45 ? "Staccato" : "Medium"}</small>
        </label>
      </div>

      <div className="exercise-editor-row">
        <label><span>Articulation gap</span>
          <input type="range" min="0" max="800" step="20" value={draft.articulationGapMs} onChange={(event) => onChange({ articulationGapMs: Number(event.target.value) })} aria-label="Articulation gap in milliseconds" />
          <small>{draft.articulationGapMs} ms silence between notes</small>
        </label>
        <label className="exercise-editor-loop"><input type="checkbox" checked={draft.loop} onChange={(event) => onChange({ loop: event.target.checked })} /> Loop</label>
      </div>

      <p className="exercise-editor-preview">Starts on {fullNoteLabel(draft.rootMidi + draft.writtenOffset, notation, saTonic)}{draft.writtenOffset !== 0 ? ` (written ${fullNoteLabel(draft.rootMidi, notation, saTonic)})` : ""}.</p>

      <div className="exercise-editor-actions">
        <button type="button" className="tone-exercise-play" onClick={onSave} disabled={!draft.name.trim()}><Save size={14} /> Save</button>
        <button type="button" onClick={onCancel}><X size={14} /> Cancel</button>
        {onDelete && <button type="button" className="chip-delete-wide" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </div>
  );
}
