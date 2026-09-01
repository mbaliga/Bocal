"use client";

import { Music2, Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recordPracticeActivity } from "./practice-data";
import { fullNoteLabel, noteName, type NotationSystem } from "./notation";
import { targetHzFor, type TemperamentId } from "./tuning";

type Waveform = "sine" | "triangle" | "sawtooth" | "square";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const WAVEFORMS: { id: Waveform; label: string }[] = [
  { id: "sine", label: "Pure" },
  { id: "triangle", label: "Soft" },
  { id: "sawtooth", label: "Bright" },
  { id: "square", label: "Reed" },
];

function midiFor(octave: number, noteIndex: number) {
  return (octave + 1) * 12 + noteIndex;
}

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
  const [playingMidi, setPlayingMidi] = useState<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => () => {
    oscillatorRef.current?.stop();
    void contextRef.current?.close();
  }, []);

  const stop = () => {
    const context = contextRef.current;
    const oscillator = oscillatorRef.current;
    const gain = gainRef.current;
    if (!context || !oscillator || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.035);
    oscillator.stop(context.currentTime + 0.13);
    oscillatorRef.current = null;
    gainRef.current = null;
    setPlayingMidi(null);
  };

  const play = async (midi: number) => {
    stop();
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (context.state === "suspended") await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.value = targetHzFor(midi, { referenceHz, temperament, keyPc: temperamentKeyPc });
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, volume), context.currentTime + 0.035);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillatorRef.current = oscillator;
    gainRef.current = gain;
    setPlayingMidi(midi);
    recordPracticeActivity({ type: "tuning", seconds: 3, notes: [fullNoteLabel(midi, "western")], label: "Reference tone" });
  };

  const notes = NOTE_NAMES.map((_, index) => {
    const midi = midiFor(octave, index);
    return { midi, name: NOTE_NAMES[index], label: noteName(midi, notation, saTonic), hz: targetHzFor(midi, { referenceHz, temperament, keyPc: temperamentKeyPc }) };
  });

  return (
    <section className="tone-generator-card" aria-labelledby="tone-generator-title">
      <header className="tone-generator-head">
        <div><span className="card-kicker"><Volume2 size={14} /> Tone generator</span><h2 id="tone-generator-title">Hear any target.</h2><p>Use a clean reference tone for a note, interval or chord shape. The synth voice follows your calibration.</p></div>
        <button className="tone-stop" onClick={stop} disabled={playingMidi === null}><Pause size={14} /> Stop</button>
      </header>
      <div className="tone-controls">
        <label><span>Octave</span><select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Voice</span><select value={waveform} onChange={(event) => setWaveform(event.target.value as Waveform)}>{WAVEFORMS.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>
        <label className="tone-volume"><span>Level</span><input type="range" min="0.03" max="0.22" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Reference tone level" /></label>
      </div>
      <div className="tone-keyboard" aria-label={`${octave} octave reference keyboard`}>
        {notes.map((item) => <button key={item.midi} className={playingMidi === item.midi ? "is-playing" : ""} onClick={() => void play(item.midi)} title={`${item.label} · ${item.hz.toFixed(1)} Hz`}><span>{item.name}</span><small>{item.label}</small>{playingMidi === item.midi ? <Pause size={12} /> : <Play size={12} />}</button>)}
      </div>
      <p className="local-note"><Music2 size={13} /> Synthetic reference voice · {referenceHz.toFixed(1)} Hz A · {temperament === "equal" ? "equal temperament" : `${temperament} temperament`}</p>
    </section>
  );
}
