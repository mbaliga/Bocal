"use client";

import { Check, Circle, Crosshair, Mic2, Music2, Pause, Play, RotateCcw, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { recordPracticeActivity } from "./practice-data";

const ROUTINE_STEPS = [
  { id: "sustain", label: "Sustain", title: "Hold one vowel", detail: "Choose a comfortable note, sing “ah” or “oo”, and keep the sound easy and even for four slow counts." },
  { id: "glide", label: "Glide", title: "Trace a gentle siren", detail: "Slide between two easy pitches. Stay in a comfortable range and stop if your voice feels strained." },
  { id: "start", label: "Start cleanly", title: "Repeat a short phrase", detail: "Take a quiet breath, begin without a hard push, then leave a little space before trying again." },
];

export function VocalStudio({ onOpenTune }: { onOpenTune: () => void }) {
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const finishRoutine = () => {
    setRunning(false);
    if (elapsedSeconds > 0) {
      recordPracticeActivity({
        type: "vocal",
        seconds: elapsedSeconds,
        instrumentId: "vocal",
        notes: ROUTINE_STEPS.filter((step) => completed.includes(step.id)).map((step) => step.label),
        label: "Vocal warm-up",
      });
    }
    setHasStarted(false);
    setSaved(true);
  };

  const resetRoutine = () => {
    setRunning(false);
    setElapsedSeconds(0);
    setHasStarted(false);
    setCompleted([]);
    setSaved(false);
  };

  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="content-wrap vocal-studio">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Vocal · singing</p>
          <h1>Find the centre of your voice.</h1>
          <p>Follow a short, self-paced warm-up. Use Tune&rsquo;s pitch display and history to observe your notes; Bocal does not score vocal technique.</p>
        </div>
        <button className="button primary" onClick={onOpenTune}><Crosshair size={16} /> Open live tuner</button>
      </header>
      <section className="vocal-routine" aria-labelledby="vocal-routine-title">
        <header className="vocal-routine-head">
          <div><span className="card-kicker"><Mic2 size={15} /> Guided warm-up · self-paced</span><h2 id="vocal-routine-title">Three easy steps</h2><p>Pause between steps whenever you need. Keep every sound in a comfortable range.</p></div>
          <div className="vocal-routine-clock" aria-live="off"><small>SESSION</small><strong>{elapsedLabel}</strong></div>
        </header>
        <div className="vocal-studio-grid">
          {ROUTINE_STEPS.map((step, index) => {
            const isComplete = completed.includes(step.id);
            const Icon = index === 0 ? Mic2 : index === 1 ? Waves : Music2;
            return (
              <button
                type="button"
                className={`vocal-studio-card ${isComplete ? "is-complete" : ""}`}
                key={step.id}
                aria-pressed={isComplete}
                onClick={() => setCompleted((current) => isComplete ? current.filter((id) => id !== step.id) : [...current, step.id])}
              >
                <span className="vocal-studio-icon">{isComplete ? <Check size={20} /> : <Icon size={20} />}</span>
                <small>{String(index + 1).padStart(2, "0")} · {step.label}</small>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
                <span className="vocal-step-state">{isComplete ? <><Check size={13} /> Done</> : <><Circle size={13} /> Mark complete</>}</span>
              </button>
            );
          })}
        </div>
        <footer className="vocal-routine-actions">
          <p aria-live="polite">{saved ? `Saved ${elapsedLabel} of Vocal practice on this device.` : !hasStarted ? "Start when you’re ready; the timer counts only while running." : `${completed.length} of ${ROUTINE_STEPS.length} steps marked complete.`}</p>
          <div>
            {saved ? <button className="button secondary" onClick={resetRoutine}><RotateCcw size={15} /> New warm-up</button> : <>
              <button className="button secondary" onClick={() => { setSaved(false); setHasStarted(true); setRunning((value) => !value); }}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause" : hasStarted ? "Resume" : "Start warm-up"}</button>
              {hasStarted && !running && <button className="button primary" onClick={finishRoutine} disabled={elapsedSeconds === 0}>Finish & save</button>}
            </>}
          </div>
        </footer>
      </section>
      <p className="local-note"><Crosshair size={13} /> The practice log and tuner history stay on this device. Pitch feedback supports listening; it is not a vocal-health measure.</p>
    </div>
  );
}
