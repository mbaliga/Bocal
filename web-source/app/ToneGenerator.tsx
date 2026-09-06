"use client";

import { Hand, ListMusic, Music2, Pause, Play, Repeat, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./styles/tone-generator.css";
import { recordPracticeActivity } from "./practice-data";
import { fullNoteLabel, noteName, octaveOf, TONIC_CHOICES, type NotationSystem } from "./notation";
import { targetHzFor, TEMPERAMENT_PROFILES, type TemperamentId } from "./tuning";
import {
  chordFrequencies,
  chordMidis,
  chordQualityById,
  CHORD_QUALITIES,
  clampPartnerMidi,
  EXERCISE_PATTERNS,
  exerciseTones,
  intervalById,
  intervalPartnerMidi,
  INTERVALS,
  type ChordQualityId,
  type ChordVoicing,
  type ExercisePatternId,
  type IntervalDirection,
  type IntervalId,
} from "./tone-math";

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

/** How far ahead of the audio clock exercise notes are queued. Same lookahead
 * PracticeTools.tsx uses for the metronome, for the same reason: a plain
 * timer drifts under load, and this is exactly the tool a player uses to
 * judge whether *they* are drifting. */
const SCHEDULE_AHEAD = 0.12;
/** How often the exercise scheduler wakes to top up the queue. */
const SCHEDULER_TICK_MS = 25;
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

  const contextRef = useRef<AudioContext | null>(null);
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
    voicesRef.current.forEach((voice) => voice.oscillators.forEach((osc) => { try { osc.stop(); } catch { /* already stopped */ } }));
    voicesRef.current.clear();
    if (followVoiceRef.current) { try { followVoiceRef.current.oscillator.stop(); } catch { /* already stopped */ } }
    followVoiceRef.current = null;
    void contextRef.current?.close();
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

  const playVoice = async (rootMidi: number) => {
    const context = getContext();
    const limiter = limiterRef.current!;
    if (context.state === "suspended") await context.resume();

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
    const pattern = exerciseTones(rootMidi, exercisePattern, tuningOptions, {
      intervalSemitones: intervalById(exerciseLeapIntervalId).semitones,
      skipFundamental: exerciseSkipFundamental,
    });
    const startTime = context.currentTime + 0.06;
    const liveNodes = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
    const visualTimers: number[] = [];
    let tick = 0;
    let cancelled = false;
    const timer: { id: number | undefined } = { id: undefined };

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

    const schedule = () => {
      const secondsPerNote = () => 60 / exerciseTempoRef.current;
      while (startTime + tick * secondsPerNote() < context.currentTime + SCHEDULE_AHEAD) {
        if (!exerciseLoop && tick >= pattern.length) {
          if (timer.id !== undefined) window.clearInterval(timer.id);
          return;
        }
        const tone = pattern[tick % pattern.length];
        const when = startTime + tick * secondsPerNote();
        const noteDuration = scheduleNote(tone, when);
        const delayMs = Math.max(0, (when - context.currentTime) * 1000);
        visualTimers.push(window.setTimeout(() => {
          if (cancelled) return;
          setExerciseCurrentMidi(tone.midi);
          setExerciseCurrentCents(tone.cents);
        }, delayMs));
        if (!exerciseLoop && tick === pattern.length - 1) {
          visualTimers.push(
            window.setTimeout(() => {
              if (cancelled) return;
              setExercisePlaying(false);
              setExerciseCurrentMidi(null);
            }, delayMs + noteDuration * 1000 + 20),
          );
        }
        tick += 1;
      }
    };

    schedule();
    timer.id = window.setInterval(schedule, SCHEDULER_TICK_MS);

    return () => {
      cancelled = true;
      if (timer.id !== undefined) window.clearInterval(timer.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercisePlaying, exercisePattern, exerciseRootPc, exerciseOctave, exerciseLeapIntervalId, exerciseSkipFundamental, exerciseLoop, referenceHz, temperament, temperamentKeyPc, customCents]);

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

        <div className="tone-exercise-controls">
          <label><span>Pattern</span>
            <select value={exercisePattern} onChange={(event) => setExercisePattern(event.target.value as ExercisePatternId)}>
              {EXERCISE_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
            </select>
          </label>
          <label><span>Root</span>
            <select value={exerciseRootPc} onChange={(event) => setExerciseRootPc(Number(event.target.value))}>
              {TONIC_CHOICES.map((choice) => <option key={choice.pc} value={choice.pc}>{choice.name}</option>)}
            </select>
          </label>
          <label><span>Octave</span>
            <select value={exerciseOctave} onChange={(event) => setExerciseOctave(Number(event.target.value))}>
              {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {exercisePattern === "interval-leaps" && (
            <label><span>Leap</span>
              <select value={exerciseLeapIntervalId} onChange={(event) => setExerciseLeapIntervalId(event.target.value as IntervalId)}>
                {INTERVALS.map((interval) => <option key={interval.id} value={interval.id}>{interval.label}</option>)}
              </select>
            </label>
          )}
          {exercisePattern === "harmonic-series" && (
            <label className="tone-skip-fundamental">
              <input type="checkbox" checked={exerciseSkipFundamental} onChange={(event) => setExerciseSkipFundamental(event.target.checked)} />
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
      </div>
    </section>
  );
}
