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

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel, type NotationSystem } from "./notation";
import { DEFAULT_TUNING_OPTIONS, decodeToAnalysisBuffer, pitchTrackFrames, type PitchTrackFrame } from "./transcribe";
import type { TuningOptions } from "./tuning";
import { computeToneStats, overallToneSummary, type ToneSegmentStats } from "./tone-stats";

/** A/B alignment: "start" lines up both takes' own t=0; "first-voiced" shifts
 *  the compared take so its first sounding frame lands under the primary
 *  take's first sounding frame, which is more useful when one recording has
 *  a longer silent lead-in than the other. */
export type TakeOverlayAlign = "start" | "first-voiced";

/** Colour for the compared take's dashed trace. Fixed rather than theme- or
 *  cents-derived, like colorForCents below -- it exists to read as visually
 *  distinct from the primary trace's in-tune/close/off colouring, not to
 *  carry its own tuning information. */
const OVERLAY_COLOR = "#8e7bff";

function firstVoicedTime(frames: PitchTrackFrame[]): number | null {
  const frame = frames.find((entry) => entry.midi !== null);
  return frame ? frame.timeSec : null;
}

type CachedTakeAnalysis = { frames: PitchTrackFrame[]; durationSec: number; stats: ToneSegmentStats[] };

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

function formatCentsSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value}¢`;
}

export function TakePitchTrace({
  takeId,
  audioUrl,
  instrument,
  notation,
  saTonic,
  audioRef,
  tuningOptions = DEFAULT_TUNING_OPTIONS,
  overlayTakeId,
  overlayAudioUrl,
  overlayLabel,
  overlayAlign = "start",
}: {
  takeId: string;
  audioUrl: string;
  instrument: InstrumentProfile;
  notation: NotationSystem;
  saTonic: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  tuningOptions?: TuningOptions;
  /** A second take's id/url to overlay on the same trace, for A/B compare.
   *  Omit (or leave overlayAudioUrl unset) for the ordinary single-take view. */
  overlayTakeId?: string;
  overlayAudioUrl?: string;
  overlayLabel?: string;
  overlayAlign?: TakeOverlayAlign;
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

  const hasOverlay = Boolean(overlayTakeId && overlayAudioUrl);
  // Only the FETCH's outcome lives in state -- a cache hit is read straight
  // from analysisCache during render below, so switching overlayTakeId to
  // an already-analysed take needs no state update (and no setState call
  // inside the effect's synchronous body) at all.
  const [overlayFetchState, setOverlayFetchState] = useState<{ id: string; analysis: CachedTakeAnalysis | null; failed: boolean }>(
    { id: "", analysis: null, failed: false },
  );
  const cachedOverlayAnalysis = overlayTakeId ? analysisCache.get(overlayTakeId) ?? null : null;
  const overlayAnalysis = hasOverlay
    ? cachedOverlayAnalysis ?? (overlayFetchState.id === overlayTakeId ? overlayFetchState.analysis : null)
    : null;
  const overlayFailed = hasOverlay && !overlayAnalysis && overlayFetchState.id === overlayTakeId && overlayFetchState.failed;
  const overlayBusy = hasOverlay && !overlayAnalysis && !overlayFailed;

  // Shared between the "redraw the static layer" effect and the "redraw the
  // playhead" effect so a resize/instrument/notation change repaints the
  // playhead too, instead of only the static waveform+trace underneath it.
  const paintRef = useRef<(currentTime: number) => void>(() => {});
  const durationRef = useRef(0);

  useEffect(() => {
    if (analysisCache.has(takeId)) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(audioUrl);
        const buffer = await response.arrayBuffer();
        const samples = await decodeToAnalysisBuffer(buffer);
        const frames = await pitchTrackFrames(
          samples,
          (fraction) => { if (!cancelled) setProgress(fraction); },
          tuningOptions,
          controller.signal,
        );
        // Cache the finished analysis even if the player switched takes
        // before it landed -- coming back to this take shouldn't re-run
        // several seconds of YIN it already did once.
        const result: CachedTakeAnalysis = {
          frames,
          durationSec: samples.length / ANALYSIS_RATE,
          stats: computeToneStats(frames),
        };
        analysisCache.set(takeId, result);
        if (!cancelled) setAnalysis(result);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError("Couldn't read this take's pitch. Playback still works.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // tuningOptions intentionally excluded: it changes rarely (a reference-
    // pitch/temperament edit in the tuner) and re-running YIN over the whole
    // take for it would be more disruptive than the trace briefly reading
    // against the previous calibration until the next take switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeId, audioUrl]);

  // Same fetch-analyse-cache pipeline as the primary take, for whichever
  // take is picked as the A/B compare target. Keyed into the same
  // analysisCache, so switching which take is "primary" vs "compared" never
  // re-runs YIN over audio Bocal has already analysed once.
  useEffect(() => {
    if (!hasOverlay || !overlayTakeId || !overlayAudioUrl || analysisCache.has(overlayTakeId)) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(overlayAudioUrl);
        const buffer = await response.arrayBuffer();
        const samples = await decodeToAnalysisBuffer(buffer);
        const frames = await pitchTrackFrames(samples, undefined, tuningOptions, controller.signal);
        const result: CachedTakeAnalysis = { frames, durationSec: samples.length / ANALYSIS_RATE, stats: computeToneStats(frames) };
        analysisCache.set(overlayTakeId, result);
        if (!cancelled) setOverlayFetchState({ id: overlayTakeId, analysis: result, failed: false });
      } catch {
        // A failed compare-take analysis just means no overlay is drawn;
        // the primary trace (and playback) still work either way.
        if (!cancelled) setOverlayFetchState({ id: overlayTakeId, analysis: null, failed: true });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOverlay, overlayTakeId, overlayAudioUrl]);

  const paint = (canvas: HTMLCanvasElement, currentTime: number) => {
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

    const durationSec = durationRef.current || 1;
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

  // Redraw the static waveform + trace whenever the analysis changes or the
  // card is resized, then repaint the playhead over it -- otherwise a
  // resize (rotation, a sidebar opening) leaves the playhead frozen at its
  // old pixel position on the new-sized static layer underneath it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    durationRef.current = Math.max(analysis.durationSec, 0.001);

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

      // The compare take's offset onto the primary's timeline: 0 when
      // aligning by start (both takes' own t=0 line up), or the gap between
      // each take's first sounding frame when aligning by first voiced
      // frame -- so two takes with different silent lead-ins still line up
      // where the playing actually starts, not where recording did.
      const overlayOffsetSec = overlayAnalysis && overlayAlign === "first-voiced"
        ? (firstVoicedTime(frames) ?? 0) - (firstVoicedTime(overlayAnalysis.frames) ?? 0)
        : 0;

      const writtenMidis = frames
        .filter((frame) => frame.midi !== null)
        .map((frame) => (frame.midi as number) + instrument.writtenOffset)
        .concat(
          overlayAnalysis
            ? overlayAnalysis.frames.filter((frame) => frame.midi !== null).map((frame) => (frame.midi as number) + instrument.writtenOffset)
            : [],
        );
      const minMidi = writtenMidis.length ? Math.min(...writtenMidis) - 2 : 60;
      const maxMidi = writtenMidis.length ? Math.max(...writtenMidis) + 2 : 84;
      const midiSpan = Math.max(maxMidi - minMidi, 1);
      const yForMidi = (midi: number) => height - ((midi - minMidi) / midiSpan) * (height - 8) - 4;

      ctx.fillStyle = muted;
      ctx.font = "10px var(--font-geist-mono, monospace)";
      ctx.textBaseline = "top";
      ctx.fillText(fullNoteLabel(Math.round(maxMidi), notation, saTonic), 4, 3);
      ctx.textBaseline = "bottom";
      ctx.fillText(fullNoteLabel(Math.round(minMidi), notation, saTonic), 4, height - 3);

      ctx.fillStyle = muted;
      const barWidth = Math.max(1, width / Math.max(frames.length, 1));
      ctx.globalAlpha = 0.4;
      for (const frame of frames) {
        const x = (frame.timeSec / durationSec) * width;
        const amplitude = Math.min(1, frame.rms * 6) * (height * 0.32);
        ctx.fillRect(x, height / 2 - amplitude, barWidth, amplitude * 2);
      }
      ctx.globalAlpha = 1;

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

      if (overlayAnalysis) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = OVERLAY_COLOR;
        ctx.lineWidth = 2;
        let overlayDrawing = false;
        let overlayPreviousX = 0;
        let overlayPreviousY = 0;
        for (const frame of overlayAnalysis.frames) {
          const x = ((frame.timeSec + overlayOffsetSec) / durationSec) * width;
          if (frame.midi === null || x < 0 || x > width) {
            overlayDrawing = false;
            continue;
          }
          const y = yForMidi(frame.midi + instrument.writtenOffset);
          if (overlayDrawing) {
            ctx.beginPath();
            ctx.moveTo(overlayPreviousX, overlayPreviousY);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          overlayPreviousX = x;
          overlayPreviousY = y;
          overlayDrawing = true;
        }
        ctx.setLineDash([]);
      }
    };

    const repaintAll = () => {
      renderStatic();
      paintRef.current(audioRef.current?.currentTime ?? 0);
    };

    repaintAll();
    const observer = new ResizeObserver(repaintAll);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [analysis, overlayAnalysis, overlayAlign, instrument, notation, saTonic, audioRef]);

  // Playhead, driven by the audio element's own play/pause state rather than
  // a timer -- an animation frame only runs while something is actually
  // playing, and stops the instant it isn't.
  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    const doPaint = (currentTime: number) => paint(canvas, currentTime);
    paintRef.current = doPaint;

    const tick = () => {
      doPaint(audio.currentTime);
      playheadFrameRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (playheadFrameRef.current !== null) cancelAnimationFrame(playheadFrameRef.current);
      playheadFrameRef.current = null;
      doPaint(audio.currentTime);
    };
    const start = () => {
      if (playheadFrameRef.current !== null) return;
      playheadFrameRef.current = requestAnimationFrame(tick);
    };

    doPaint(audio.currentTime);
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

  // Tap/click anywhere on the trace to seek playback there -- the trace is
  // otherwise a picture only, with no way to jump to the moment it shows.
  const seekToPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !durationRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    audio.currentTime = fraction * durationRef.current;
    paintRef.current(audio.currentTime);
  };

  return (
    <div className="take-pitch-trace">
      <canvas
        ref={canvasRef}
        aria-label="Pitch over time for this take, plotted over its waveform. Tap to seek."
        onPointerDown={seekToPointer}
      />
      {busy && (
        <div className="take-pitch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
          <span>Reading pitch… {Math.round(progress * 100)}%</span>
        </div>
      )}
      {error && <p className="take-pitch-error">{error}</p>}
      {!busy && !error && analysis && (
        <>
          <p className="take-pitch-legend">
            <span className="legend-swatch legend-true" /> in tune
            <span className="legend-swatch legend-near" /> close
            <span className="legend-swatch legend-off" /> off
            {hasOverlay && <span className="legend-swatch legend-overlay" />}
            {hasOverlay && (overlayLabel || "compared take")}
            <span className="legend-gap">gaps are unvoiced or too weak to read</span>
          </p>
          {hasOverlay && overlayBusy && (
            <p className="take-pitch-compare-status" role="status">Reading {overlayLabel || "the compared take"}&rsquo;s pitch…</p>
          )}
          {hasOverlay && overlayFailed && (
            <p className="take-pitch-compare-status">Couldn&rsquo;t read {overlayLabel || "the compared take"}&rsquo;s pitch. Its trace is not shown.</p>
          )}
          {hasOverlay && overlayAnalysis && (() => {
            const primarySummary = overallToneSummary(analysis.frames);
            const overlaySummary = overallToneSummary(overlayAnalysis.frames);
            if (!primarySummary || !overlaySummary) return null;
            const deltaMean = Math.round((primarySummary.meanCents - overlaySummary.meanCents) * 10) / 10;
            const deltaSpread = Math.round((primarySummary.stdDevCents - overlaySummary.stdDevCents) * 10) / 10;
            return (
              <p className="take-compare-diff" aria-label="Difference from the compared take">
                This take vs {overlayLabel || "compared take"}: mean {formatCentsSigned(deltaMean)}¢, spread {deltaSpread > 0 ? "+" : ""}{deltaSpread}¢ sd
              </p>
            );
          })()}
          {analysis.stats.length > 0 && (
            <ol className="take-tone-stats" aria-label="Sustained-tone statistics per held note">
              {analysis.stats.map((stat, index) => (
                <li key={`${stat.startSec}-${index}`}>
                  <span className="tone-stat-time">{stat.startSec.toFixed(1)}s</span>
                  <span className="tone-stat-cents">avg {formatCentsSigned(stat.meanCents)}</span>
                  <span className="tone-stat-sd">±{stat.stdDevCents}¢ sd</span>
                  {stat.vibratoRateHz !== null && (
                    <span className="tone-stat-vibrato">{stat.vibratoRateHz} Hz vibrato · {stat.vibratoWidthCents}¢</span>
                  )}
                  {stat.attackOffsetCents !== null && Math.abs(stat.attackOffsetCents) >= 3 && (
                    <span className="tone-stat-attack">attack {formatCentsSigned(stat.attackOffsetCents)} vs body</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
