"use client";

import { Crosshair, Mic2, Music2, Waves } from "lucide-react";

export function VocalStudio({ onOpenTune }: { onOpenTune: () => void }) {
  return (
    <div className="content-wrap vocal-studio">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Vocal · singing</p>
          <h1>Find the centre of your voice.</h1>
          <p>Sing a comfortable, sustained vowel and use Bocal&rsquo;s live tuner to settle the pitch. These prompts support practice; they are not a vocal technique assessment.</p>
        </div>
        <button className="button primary" onClick={onOpenTune}><Crosshair size={16} /> Open live tuner</button>
      </header>
      <div className="vocal-studio-grid">
        <article className="vocal-studio-card">
          <span className="vocal-studio-icon"><Mic2 size={20} /></span>
          <small>01 · Sustain</small>
          <h2>Hold one vowel</h2>
          <p>Choose a comfortable note, sing “ah” or “oo”, and keep the sound even for four slow counts.</p>
        </article>
        <article className="vocal-studio-card">
          <span className="vocal-studio-icon"><Waves size={20} /></span>
          <small>02 · Glide</small>
          <h2>Trace a gentle siren</h2>
          <p>Slide between two easy pitches without forcing the top or bottom of your range. Watch the trace, not just the needle.</p>
        </article>
        <article className="vocal-studio-card">
          <span className="vocal-studio-icon"><Music2 size={20} /></span>
          <small>03 · Start cleanly</small>
          <h2>Repeat a short phrase</h2>
          <p>Take a quiet breath, start the note without a hard push, and leave a little space before trying it again.</p>
        </article>
      </div>
      <p className="local-note"><Crosshair size={13} /> Vocal pitch readings stay on this device, like every Bocal tuner session.</p>
    </div>
  );
}
