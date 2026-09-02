"use client";

/**
 * Pitch-vs-time overlay for a recorded or imported take.
 *
 * TonalEnergy Tuner and Tunable both let a player look back at a recording
 * and see where their pitch actually sat, not just hear it. Bocal's takes
 * only ever had a bare <audio> element. This draws a waveform for the take
 * and traces its pitch over it, coloured by how far off each moment was.
 *
 * The analysis itself is the same offline pipeline transcribe.ts uses for
 * file transcription -- decodeToAnalysisBuffer, then pitchTrackFrames, both
 * imported rather than reimplemented. That keeps the gating, the harmonic-
 * support check and the median smoothing identical to the rest of the app:
 * a stretch that wouldn't count toward a transcribed note shows here as a
 * gap in the trace instead of a guess.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel, type NotationSystem } from "./notation";
import { decodeToAnalysisBuffer, pitchTrackFrames, type PitchTrackFrame } from "./transcribe";

type CachedTakeAnalysis = { frames: PitchTrackFrame[]; durationSec: number };

/** Keyed by take id so switching between takes and back doesn't re-run the
 *  analysis. Bounded in practice: AnalysisView keeps at most 12 takes. */
const analysisCache = new Map<string, CachedTakeAnalysis>();

/** Drop a take's cached analysis. Call this when the take itself is deleted
 *  so the cache doesn't hold analysis for takes that no longer exist. */
export function forgetTakeAnalysis(takeId: string) {
  analysisCache.delete(takeId);
}

// Must match ANALYSIS_RATE in transcribe.ts -- pitchTrackFrames reports
// timeSec against that rate, not the take's original sample rate.
const ANALYSIS_RATE = 16000;

/**
 * The live tuner's precision setting (±10 / ±5 / ±2 cents) lives in
 * page.tsx's local component state and is never written to storage, so it
 * cannot be read from here without changing a file this feature must not
 * touch. These are the brief's stated fallback bands.
 */
const TIGHT_CENTS = 5;
const LOOSE_CENTS = 15;

function colorForCents(cents: number) {
  const magnitude = Math.abs(cents);
  if (magnitude <= TIGHT_CENTS) return "#3ddc84";
  if (magnitude <= LOOSE_CENTS) return "#e5b95c";
  return "#e5615c";
}

function readCssVar(canvas: HTMLCanvasElement, name: string, fallback: string) {
  const value = getComputedStyle(canvas).getPropertyValue(name).trim();
  return value || fallback;
}

export function TakePitchTrace({
  takeId,
  audioUrl,
  instrument,
  notation,
  saTonic,
  audioRef,
}: {
  takeId: string;
  audioUrl: string;
  instrument: InstrumentProfile;
  notation: NotationSystem;
  saTonic: number;
  audioRef: RefObject<HTMLAudioElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadFrameRef = useRef<number | null>(null);
  // The component remounts on take switch (AnalysisView keys it by take id),
  // so a cache hit can seed state straight from the lazy initialiser instead
  // of a setState call inside the effect below.
  const [analysis, setAnalysis] = useState<CachedTakeAnalysis | null>(() => analysisCache.get(takeId) ?? null);
  const [progress, setProgress] = useState(() => (analysisCache.has(takeId) ? 1 : 0));
  const [busy, setBusy] = useState(() => !analysisCache.has(takeId));
  const [error, setError] = useState("");

  useEffect(() => {
    // Cache hit: the lazy initialisers above already seeded analysis/busy/
    // progress correctly, and takeId changing always remounts this
    // component (it's keyed by take id in AnalysisView), so there is
    // nothing left to synchronise here.
    if (analysisCache.has(takeId)) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(audioUrl);
        const buffer = await response.arrayBuffer();
        const samples = await decodeToAnalysisBuffer(buffer);
        const frames = await pitchTrackFrames(samples, (fraction) => {
          if (!cancelled) setProgress(fraction);
        });
        if (cancelled) return;
        const result: CachedTakeAnalysis = { frames, durationSec: samples.length / ANALYSIS_RATE };
        analysisCache.set(takeId, result);
        setAnalysis(result);
      } catch {
        if (!cancelled) setError("Couldn't read this take's pitch. Playback still works.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [takeId, audioUrl]);

  // Redraw the static waveform + trace whenever the analysis changes or the
  // card is resized. Kept off the animation loop -- this only needs to run
  // once per input, not once per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;

    const renderStatic = () => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      let offscreen = staticCanvasRef.current;
      if (!offscreen) {
        offscreen = document.createElement("canvas");
        staticCanvasRef.current = offscreen;
      }
      offscreen.width = Math.floor(width * ratio);
      offscreen.height = Math.floor(height * ratio);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const lineColor = readCssVar(canvas, "--line", "#28282c");
      const muted = readCssVar(canvas, "--muted", "#9c9b98");

      // Reference lines, purely for scale -- not gridlines with meaning.
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (const fraction of [0.25, 0.5, 0.75]) {
        const y = height * fraction;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const frames = analysis.frames;
      const durationSec = Math.max(analysis.durationSec, 0.001);

      // Written-pitch range for the y axis, taken from what was actually
      // voiced in the take (padded two semitones) rather than the
      // instrument's full range, so a take that only covers a fourth isn't
      // squashed to a hairline in the middle of four octaves.
      const writtenMidis = frames
        .filter((frame) => frame.midi !== null)
        .map((frame) => (frame.midi as number) + instrument.writtenOffset);
      const minMidi = writtenMidis.length ? Math.min(...writtenMidis) - 2 : 60;
      const maxMidi = writtenMidis.length ? Math.max(...writtenMidis) + 2 : 84;
      const midiSpan = Math.max(maxMidi - minMidi, 1);
      const yForMidi = (midi: number) => height - ((midi - minMidi) / midiSpan) * (height - 8) - 4;

      // Note names for the top and bottom of the range actually sung/played,
      // in whichever notation system the player reads.
      ctx.fillStyle = muted;
      ctx.font = "10px var(--font-geist-mono, monospace)";
      ctx.textBaseline = "top";
      ctx.fillText(fullNoteLabel(Math.round(maxMidi), notation, saTonic), 4, 3);
      ctx.textBaseline = "bottom";
      ctx.fillText(fullNoteLabel(Math.round(minMidi), notation, saTonic), 4, height - 3);

      // Waveform: the RMS carried on every frame already, at the same hop
      // pitchTrackFrames used, so no separate downsampling pass is needed.
      ctx.fillStyle = muted;
      const barWidth = Math.max(1, width / Math.max(frames.length, 1));
      ctx.globalAlpha = 0.4;
      for (const frame of frames) {
        const x = (frame.timeSec / durationSec) * width;
        const amplitude = Math.min(1, frame.rms * 6) * (height * 0.32);
        ctx.fillRect(x, height / 2 - amplitude, barWidth, amplitude * 2);
      }
      ctx.globalAlpha = 1;

      // Pitch trace: a coloured line through voiced frames, broken wherever
      // a frame didn't pass the same gate and harmonic-support rule the
      // note segmenter uses -- silence, noise, or more than one note at once
      // all show up as a gap rather than a guessed line.
      ctx.lineWidth = 2;
      let drawing = false;
      let previousX = 0;
      let previousY = 0;
      for (const frame of frames) {
        const x = (frame.timeSec / durationSec) * width;
        if (frame.midi === null) {
          drawing = false;
          continue;
        }
        const y = yForMidi(frame.midi + instrument.writtenOffset);
        ctx.strokeStyle = colorForCents(frame.cents);
        if (drawing) {
          ctx.beginPath();
          ctx.moveTo(previousX, previousY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        previousX = x;
        previousY = y;
        drawing = true;
      }
    };

    renderStatic();
    const observer = new ResizeObserver(() => renderStatic());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [analysis, instrument, notation, saTonic]);

  // Playhead, driven by the audio element's own play/pause state rather than
  // a timer -- an animation frame only runs while something is actually
  // playing, and stops the instant it isn't.
  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    const paint = (currentTime: number) => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (staticCanvasRef.current) ctx.drawImage(staticCanvasRef.current, 0, 0, width, height);

      const durationSec = analysis ? Math.max(analysis.durationSec, 0.001) : audio.duration || 1;
      const x = Math.min(width, Math.max(0, (currentTime / durationSec) * width));
      ctx.strokeStyle = readCssVar(canvas, "--ink", "#f5f3eb");
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      paint(audio.currentTime);
      playheadFrameRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (playheadFrameRef.current !== null) cancelAnimationFrame(playheadFrameRef.current);
      playheadFrameRef.current = null;
      paint(audio.currentTime);
    };
    const start = () => {
      if (playheadFrameRef.current !== null) return;
      playheadFrameRef.current = requestAnimationFrame(tick);
    };

    paint(audio.currentTime);
    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("seeked", stop);
    if (!audio.paused) start();

    return () => {
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("seeked", stop);
      if (playheadFrameRef.current !== null) cancelAnimationFrame(playheadFrameRef.current);
      playheadFrameRef.current = null;
    };
  }, [analysis, audioRef]);

  return (
    <div className="take-pitch-trace">
      <canvas ref={canvasRef} aria-label="Pitch over time for this take, plotted over its waveform" />
      {busy && (
        <div className="take-pitch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
          <span>Reading pitch… {Math.round(progress * 100)}%</span>
        </div>
      )}
      {error && <p className="take-pitch-error">{error}</p>}
      {!busy && !error && analysis && (
        <p className="take-pitch-legend">
          <span className="legend-swatch legend-true" /> in tune
          <span className="legend-swatch legend-near" /> close
          <span className="legend-swatch legend-off" /> off
          <span className="legend-gap">gaps are unvoiced or too weak to read</span>
        </p>
      )}
    </div>
  );
}
