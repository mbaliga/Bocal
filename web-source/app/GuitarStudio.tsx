"use client";

import { Check, ChevronLeft, ChevronRight, CircleDot, Ear, Guitar, Mic, Pause, Play, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FINGER_COLORS, FOUR_CHORD_FLOW, GUITAR_CHORDS, GUITAR_TUNINGS, midiToFrequency, type GuitarChord } from "./guitar-data";
import { recordPracticeActivity } from "./practice-data";

export type GuitarPitchReading = {
  hz: number;
  cents: number;
  midi: number;
};

function centsFromTarget(hz: number, targetMidi: number) {
  return Math.round(1200 * Math.log2(hz / midiToFrequency(targetMidi)));
}

function closestString<T extends { midi: number }>(hz: number, strings: T[]): T {
  return strings.reduce((closest, candidate) => Math.abs(centsFromTarget(hz, candidate.midi)) < Math.abs(centsFromTarget(hz, closest.midi)) ? candidate : closest, strings[0]);
}

function playPitch(hz: number) {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.74);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.8);
  window.setTimeout(() => void context.close(), 900);
}

function GuitarFretboard({ chord }: { chord: GuitarChord }) {
  const stringY = [28, 62, 96, 130, 164, 198];
  const fretX = [114, 210, 306, 402, 498];
  return (
    <svg className="guitar-fretboard" viewBox="0 0 620 228" role="img" aria-label={`${chord.name} chord chart with colour coded fingers`}>
      <rect x="96" y="12" width="432" height="202" rx="14" fill="rgba(11,11,13,.76)" stroke="#3a3634" />
      {fretX.map((x, index) => <line key={`fret-${index}`} x1={x} x2={x} y1="12" y2="214" stroke={index === 0 ? "#e7ddc4" : "#5e5550"} strokeWidth={index === 0 ? 7 : 3} />)}
      {stringY.map((y, index) => <line key={`string-${index}`} x1="96" x2="528" y1={y} y2={y} stroke="#d7c2a2" strokeOpacity={0.72} strokeWidth={Math.max(1, 5 - index * 0.6)} />)}
      {[1, 2, 3, 4].map((fret) => <text key={fret} x={fretX[fret - 1] + 48} y="224" fill="#74706c" textAnchor="middle" fontSize="12">{fret}</text>)}
      {chord.frets.map((fret, stringIndex) => {
        const finger = chord.fingers[stringIndex];
        const y = stringY[stringIndex];
        if (fret === null) return <text key={`mute-${stringIndex}`} x="60" y={y + 5} fill="#ff7d91" textAnchor="middle" fontSize="19">×</text>;
        if (fret === 0) return <circle key={`open-${stringIndex}`} cx="60" cy={y} r="10" fill="none" stroke="#b8b6af" strokeWidth="2" />;
        const x = fretX[fret - 1] + 48;
        const colour = FINGER_COLORS[finger]?.color ?? "#f4f1e8";
        return <g key={`finger-${stringIndex}`}><circle cx={x} cy={y} r="16" fill={colour} /><text x={x} y={y + 5} fill="#071917" textAnchor="middle" fontSize="14" fontWeight="700">{finger}</text></g>;
      })}
    </svg>
  );
}

function FingerLegend() {
  return <div className="finger-legend" aria-label="Finger colour guide">{Object.entries(FINGER_COLORS).map(([finger, info]) => <span key={finger}><i style={{ background: info.color }}>{finger}</i>{info.label}</span>)}</div>;
}

export function GuitarStudio({ reading, listening, onListen }: { reading: GuitarPitchReading | null; listening: boolean; onListen: () => void }) {
  const [tuningId, setTuningId] = useState("standard");
  const [selectedStringId, setSelectedStringId] = useState("e2");
  const [autoString, setAutoString] = useState(true);
  const [selectedChordId, setSelectedChordId] = useState<string>("g");
  const [playerStep, setPlayerStep] = useState(0);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [waitForRoot, setWaitForRoot] = useState(true);
  const rootFrames = useRef(0);
  const playerStartedAt = useRef<number | null>(null);
  const tuning = GUITAR_TUNINGS.find((item) => item.id === tuningId) ?? GUITAR_TUNINGS[0];
  const selectedString = tuning.strings.find((item) => item.id === selectedStringId) ?? tuning.strings[0];
  const autoCandidate = reading ? closestString(reading.hz, tuning.strings) : selectedString;
  const activeString = autoString ? autoCandidate : selectedString;
  const stringCents = reading ? centsFromTarget(reading.hz, activeString.midi) : null;
  const stringInTune = stringCents !== null && Math.abs(stringCents) <= 5;
  const selectedChord = GUITAR_CHORDS.find((item) => item.id === selectedChordId) ?? GUITAR_CHORDS[0];
  const progression = FOUR_CHORD_FLOW.map((id) => GUITAR_CHORDS.find((item) => item.id === id)!).filter(Boolean);
  const playerChord = progression[playerStep] ?? progression[0];

  useEffect(() => {
    if (!playerPlaying || waitForRoot) return;
    const timer = window.setInterval(() => setPlayerStep((current) => (current + 1) % progression.length), 2400);
    return () => window.clearInterval(timer);
  }, [playerPlaying, progression.length, waitForRoot]);

  useEffect(() => {
    if (!playerPlaying || !waitForRoot || !reading) {
      rootFrames.current = 0;
      return;
    }
    const heardRoot = reading.note.replace("♯", "#") === playerChord.root.replace("♯", "#") && Math.abs(reading.cents) <= 12;
    rootFrames.current = heardRoot ? rootFrames.current + 1 : 0;
    if (rootFrames.current < 3) return;
    rootFrames.current = 0;
    recordPracticeActivity({ type: "chords", seconds: 12, instrumentId: "guitar", notes: [`${playerChord.root}${reading.octave}`], label: `${playerChord.name} root heard` });
    setPlayerStep((current) => (current + 1) % progression.length);
  }, [playerChord.name, playerChord.root, playerPlaying, progression.length, reading, waitForRoot]);

  const togglePlayer = () => {
    setPlayerPlaying((current) => {
      if (!current) playerStartedAt.current = performance.now();
      if (current && playerStartedAt.current !== null) {
        recordPracticeActivity({ type: "chords", seconds: (performance.now() - playerStartedAt.current) / 1000, instrumentId: "guitar", label: "Four-chord flow" });
        playerStartedAt.current = null;
      }
      return !current;
    });
  };

  const instruction = !reading ? "Play one open string." : stringInTune ? `${activeString.label} is centered.` : stringCents! > 0 ? "Ease it down." : "Bring it up.";

  return (
    <div className="content-wrap guitar-studio">
      <section className="section-heading guitar-heading">
        <div><p className="eyebrow">Learn · Guitar</p><h1>Hear it. Place it. Play it.</h1><p>One tuner, one colour language, and a patient chord player that waits for your root note.</p></div>
        <div className="live-badge"><span className={listening ? "pulse-dot" : "quiet-dot"} /> {listening ? "Listening" : "Ready"}</div>
      </section>

      <div className="guitar-primary-grid">
        <section className="guitar-tuner-card">
          <div className="guitar-card-head"><span className="card-kicker"><Guitar size={15} /> String tuner</span><select value={tuningId} onChange={(event) => setTuningId(event.target.value)} aria-label="Guitar tuning">{GUITAR_TUNINGS.map((item) => <option value={item.id} key={item.id}>{item.label} · {item.detail}</option>)}</select></div>
          <div className="guitar-tuner-readout"><span>Target</span><strong>{activeString.label}</strong><small>{stringCents === null ? "Waiting for a clear pitch" : `${stringCents > 0 ? "+" : ""}${stringCents}¢ · ${instruction}`}</small></div>
          <div className={`guitar-string-meter ${stringInTune ? "is-centered" : ""}`}><i /><b style={{ left: `${Math.max(5, Math.min(95, 50 + (stringCents ?? 0) * 0.85))}%` }} /></div>
          <div className="guitar-string-grid" aria-label="Open strings">{tuning.strings.map((item) => <button key={item.id} className={activeString.id === item.id ? "is-active" : ""} onClick={() => { setAutoString(false); setSelectedStringId(item.id); }}><small>String {item.course}</small><strong>{item.label}</strong><span>{activeString.id === item.id && stringInTune ? <Check size={13} /> : ""}</span></button>)}</div>
          <div className="guitar-tuner-actions"><button className={`listen-button ${listening ? "is-live" : ""}`} onClick={onListen}>{listening ? <Pause size={18} /> : <Mic size={18} />}{listening ? "Stop listening" : "Tune with microphone"}</button><button className={`guitar-auto ${autoString ? "is-active" : ""}`} onClick={() => setAutoString((value) => !value)} aria-pressed={autoString}>Auto string</button></div>
          <p className="local-note"><CircleDot size={13} /> Choose a string yourself, or let a clear note select the nearest open string.</p>
        </section>

        <aside className="guitar-chord-card">
          <div className="guitar-card-head"><span className="card-kicker"><Sparkles size={15} /> Chord placement</span><button onClick={() => playPitch(midiToFrequency(selectedChord.rootMidi))}><Volume2 size={15} /> Hear root</button></div>
          <div className="guitar-chord-title"><div><strong>{selectedChord.name}</strong><span>{selectedChord.description}</span></div><em>Root · {selectedChord.root}</em></div>
          <GuitarFretboard chord={selectedChord} />
          <FingerLegend />
          <div className="guitar-chord-row">{GUITAR_CHORDS.map((chord) => <button key={chord.id} className={selectedChord.id === chord.id ? "is-active" : ""} onClick={() => setSelectedChordId(chord.id)}>{chord.name}</button>)}</div>
        </aside>
      </div>

      <section className="chord-player-card">
        <div className="chord-player-intro"><span className="card-kicker"><Ear size={15} /> Follow player</span><h2>Four-chord flow.</h2><p>Use the coloured fingering chart, play a clear root note, and Bocal can wait before revealing the next shape.</p></div>
        <div className="chord-flow" aria-label="Four chord flow">{progression.map((chord, index) => <button key={`${chord.id}-${index}`} className={playerStep === index ? "is-current" : ""} onClick={() => { setPlayerStep(index); setSelectedChordId(chord.id); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{chord.name}</strong><small>{chord.root} root</small></button>)}</div>
        <div className="chord-player-controls"><button className={`chord-play ${playerPlaying ? "is-playing" : ""}`} onClick={togglePlayer}>{playerPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}{playerPlaying ? "Pause flow" : "Start flow"}</button><button className={`wait-toggle ${waitForRoot ? "is-active" : ""}`} onClick={() => setWaitForRoot((value) => !value)} aria-pressed={waitForRoot}>{waitForRoot ? "Wait for correct root" : "Advance every 4 beats"}</button><button className="chord-step" onClick={() => setPlayerStep((value) => (value + progression.length - 1) % progression.length)} aria-label="Previous chord"><ChevronLeft size={18} /></button><button className="chord-step" onClick={() => setPlayerStep((value) => (value + 1) % progression.length)} aria-label="Next chord"><ChevronRight size={18} /></button></div>
        {waitForRoot && <p className="chord-player-note">{listening ? `Listening for ${playerChord.root}. Play one clean root note to continue.` : "Start the tuner when you want Bocal to listen for the next root."}</p>}
      </section>
    </div>
  );
}
