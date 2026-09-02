"use client";

import { Hand, ListMusic, Music2, Pause, Play, Repeat, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recordPracticeActivity } from "./practice-data";
import { fullNoteLabel, noteName, octaveOf, TONIC_CHOICES, type NotationSystem } from "./notation";
import { targetHzFor, type TemperamentId } from "./tuning";
import {
  chordFrequencies,
  chordMidis,
  chordQualityById,
  CHORD_QUALITIES,
  EXERCISE_PATTERNS,
  exerciseMidis,
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
const MAX_SUSTAIN_VOICES = 8;

function midiFor(octave: number, noteIndex: number) {
  return (octave + 1) * 12 + noteIndex;
}

type Voice = { oscillators: OscillatorNode[]; gain: GainNode; tones: { midi: number; label: string; hz: number }[] };
type SoundingTone = { midi: number; label: string; hz: number };

export function ToneGenerator({
  referenceHz,
  temperament,
  temperamentKeyPc,
  notation,
  saTonic,
}: {
  referenceHz: number;
  temperament: TemperamentId;
  temperamentKeyPc: number;
  notation: NotationSystem;
  saTonic: number;
}) {
  const [octave, setOctave] = useState(4);
  const [waveform, setWaveform] = useState<Waveform>("sine");
  const [volume, setVolume] = useState(0.12);
  const [shape, setShape] = useState<PlayShape>("note");
  const [sustain, setSustain] = useState(false);
  const [intervalId, setIntervalId] = useState<IntervalId>("P5");
  const [intervalDirection, setIntervalDirection] = useState<IntervalDirection>("above");
  const [chordQuality, setChordQuality] = useState<ChordQualityId>("major");
  const [chordVoicing, setChordVoicing] = useState<ChordVoicing>("close");
  const [playingRoots, setPlayingRoots] = useState<Set<number>>(new Set());
  const [soundingTones, setSoundingTones] = useState<SoundingTone[]>([]);

  const [exercisePattern, setExercisePattern] = useState<ExercisePatternId>("major-scale");
  const [exerciseRootPc, setExerciseRootPc] = useState(0);
  const [exerciseOctave, setExerciseOctave] = useState(4);
  const [exerciseLeapIntervalId, setExerciseLeapIntervalId] = useState<IntervalId>("P5");
  const [exerciseTempo, setExerciseTempo] = useState(80);
  const [exerciseNoteLength, setExerciseNoteLength] = useState(0.8);
  const [exerciseLoop, setExerciseLoop] = useState(true);
  const [exercisePlaying, setExercisePlaying] = useState(false);
  const [exerciseCurrentMidi, setExerciseCurrentMidi] = useState<number | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());

  const tuningOptions = { referenceHz, temperament, keyPc: temperamentKeyPc };

  useEffect(() => () => {
    voicesRef.current.forEach((voice) => voice.oscillators.forEach((osc) => { try { osc.stop(); } catch { /* already stopped */ } }));
    voicesRef.current.clear();
    void contextRef.current?.close();
  }, []);

  const syncVoiceState = () => {
    const roots = new Set(voicesRef.current.keys());
    const toneMap = new Map<number, SoundingTone>();
    voicesRef.current.forEach((voice) => voice.tones.forEach((tone) => toneMap.set(tone.midi, tone)));
    setPlayingRoots(roots);
    setSoundingTones([...toneMap.values()].sort((a, b) => a.midi - b.midi));
  };

  /** Rebalances every active voice's level to 1/sqrt(n) of the chosen level,
   * so latching several sustained voices at once doesn't clip. */
  const rescaleVoices = () => {
    const context = contextRef.current;
    if (!context) return;
    const count = voicesRef.current.size;
    if (count === 0) return;
    const target = Math.max(0.02, volume) / Math.sqrt(count);
    voicesRef.current.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(context.currentTime);
      voice.gain.gain.setTargetAtTime(target, context.currentTime, 0.035);
    });
  };

  const tonesForRoot = (rootMidi: number): SoundingTone[] => {
    if (shape === "interval") {
      const semitones = intervalById(intervalId).semitones;
      const partner = intervalPartnerMidi(rootMidi, semitones, intervalDirection);
      return [rootMidi, partner].map((midi) => ({ midi, label: fullNoteLabel(midi, notation, saTonic), hz: targetHzFor(midi, tuningOptions) }));
    }
    if (shape === "chord") {
      const midis = chordMidis(rootMidi, chordQuality, chordVoicing);
      const hz = chordFrequencies(rootMidi, chordQuality, chordVoicing, tuningOptions);
      return midis.map((midi, index) => ({ midi, label: fullNoteLabel(midi, notation, saTonic), hz: hz[index] }));
    }
    return [{ midi: rootMidi, label: fullNoteLabel(rootMidi, notation, saTonic), hz: targetHzFor(rootMidi, tuningOptions) }];
  };

  const stopVoice = (rootMidi: number) => {
    const context = contextRef.current;
    const voice = voicesRef.current.get(rootMidi);
    if (!context || !voice) return;
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.035);
    voice.oscillators.forEach((osc) => osc.stop(context.currentTime + 0.13));
    voicesRef.current.delete(rootMidi);
    syncVoiceState();
    rescaleVoices();
  };

  const stopAllVoices = () => {
    [...voicesRef.current.keys()].forEach(stopVoice);
  };

  const playVoice = async (rootMidi: number) => {
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (context.state === "suspended") await context.resume();

    const tones = tonesForRoot(rootMidi);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.connect(context.destination);
    const oscillators = tones.map((tone) => {
      const oscillator = context.createOscillator();
      oscillator.type = waveform;
      oscillator.frequency.value = tone.hz;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    voicesRef.current.set(rootMidi, { oscillators, gain, tones });
    syncVoiceState();
    rescaleVoices();

    const label = shape === "chord" ? `${chordQualityById(chordQuality).label} chord` : shape === "interval" ? `${intervalById(intervalId).label} interval` : "Reference tone";
    recordPracticeActivity({ type: "tuning", seconds: 3, notes: tones.map((tone) => tone.label), label });
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
  }, [volume]);

  // ---------------------------------------------------------------------
  // Exercise player: schedules every note ahead on the audio clock, exactly
  // like the metronome in PracticeTools.tsx. The on-screen highlight rides a
  // plain visual timer -- fine here, since a few milliseconds of jitter in
  // when a key lights up is invisible, unlike the note's actual timing.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!exercisePlaying) return undefined;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (context.state === "suspended") void context.resume();

    const rootMidi = midiFor(exerciseOctave, exerciseRootPc);
    const pattern = exerciseMidis(rootMidi, exercisePattern, { intervalSemitones: intervalById(exerciseLeapIntervalId).semitones });
    const secondsPerNote = 60 / exerciseTempo;
    const noteDuration = Math.max(0.08, secondsPerNote * exerciseNoteLength);
    const startTime = context.currentTime + 0.06;
    const oscillators: OscillatorNode[] = [];
    const visualTimers: number[] = [];
    let tick = 0;
    const timer: { id: number | undefined } = { id: undefined };

    const scheduleNote = (midi: number, when: number) => {
      const hz = targetHzFor(midi, tuningOptions);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = hz;
      const level = Math.max(0.02, volume);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level, when + 0.02);
      gain.gain.setValueAtTime(level, Math.max(when + 0.02, when + noteDuration - 0.03));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + noteDuration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(when);
      oscillator.stop(when + noteDuration + 0.02);
      oscillators.push(oscillator);
    };

    const schedule = () => {
      while (startTime + tick * secondsPerNote < context.currentTime + SCHEDULE_AHEAD) {
        if (!exerciseLoop && tick >= pattern.length) {
          if (timer.id !== undefined) window.clearInterval(timer.id);
          return;
        }
        const midi = pattern[tick % pattern.length];
        const when = startTime + tick * secondsPerNote;
        scheduleNote(midi, when);
        const delayMs = Math.max(0, (when - context.currentTime) * 1000);
        visualTimers.push(window.setTimeout(() => setExerciseCurrentMidi(midi), delayMs));
        if (!exerciseLoop && tick === pattern.length - 1) {
          visualTimers.push(
            window.setTimeout(() => { setExercisePlaying(false); setExerciseCurrentMidi(null); }, delayMs + noteDuration * 1000 + 20),
          );
        }
        tick += 1;
      }
    };

    schedule();
    timer.id = window.setInterval(schedule, SCHEDULER_TICK_MS);

    return () => {
      if (timer.id !== undefined) window.clearInterval(timer.id);
      visualTimers.forEach(window.clearTimeout);
      const now = context.currentTime;
      oscillators.forEach((oscillator) => { try { oscillator.stop(now); } catch { /* already stopped */ } });
      setExerciseCurrentMidi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercisePlaying, exercisePattern, exerciseRootPc, exerciseOctave, exerciseLeapIntervalId, exerciseTempo, exerciseNoteLength, exerciseLoop, waveform, volume, referenceHz, temperament, temperamentKeyPc]);

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

  return (
    <section className="tone-generator-card" aria-labelledby="tone-generator-title">
      <header className="tone-generator-head">
        <div><span className="card-kicker"><Volume2 size={14} /> Tone generator</span><h2 id="tone-generator-title">Hear any target.</h2><p>Use a clean reference tone for a note, interval or chord shape. The synth voice follows your calibration.</p></div>
        <button className="tone-stop" onClick={stopAllVoices} disabled={!isAnythingSounding}><Pause size={14} /> {sustain ? "Release all" : "Stop"}</button>
      </header>

      <div className="tone-controls">
        <label><span>Octave</span><select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Voice</span><select value={waveform} onChange={(event) => setWaveform(event.target.value as Waveform)}>{WAVEFORMS.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>
        <label className="tone-volume"><span>Level</span><input type="range" min="0.03" max="0.22" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Reference tone level" /></label>
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
            ? "Beat-free: with just intonation active, this chord's third and fifth are tuned pure around its own root, not your calibrated key centre."
            : temperament === "equal"
              ? "Equal temperament: the chord's tones are plain equal-tempered, same as the rest of the tuner."
              : "This chord follows your calibrated temperament and key centre, same as any other note here. Switch to just intonation for a beat-free chord."}
        </p>
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

      <p className="local-note"><Music2 size={13} /> Synthetic reference voice · {referenceHz.toFixed(1)} Hz A · {temperament === "equal" ? "equal temperament" : `${temperament} temperament`}</p>

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
              ? `Now: ${fullNoteLabel(exerciseCurrentMidi, notation, saTonic)}`
              : `Starts on ${fullNoteLabel(exerciseRoot, notation, saTonic)}`}
          </span>
        </div>
      </div>
    </section>
  );
}
