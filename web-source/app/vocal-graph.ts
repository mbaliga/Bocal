// Pure maths for the Vocal workspace's live singing pitch graph.
//
// Nothing here touches the DOM or a canvas, so every scaling rule (MIDI to
// y, time to x, zoom and pan clamps, gap breaking, tick choice) is unit
// tested under Node -- see tests/vocal-graph.test.mjs. The canvas painting
// that uses these lives in vocal-graph-canvas.ts and the pointer handling in
// VocalPitchGraph.tsx.
//
// Conventions
//   * Pitch is a fractional MIDI number: the nearest semitone plus cents/100.
//   * Time is `performance.now()` milliseconds, the same clock the tuner's
//     sampling loop stamps its history samples with.
//   * A "zoom factor" above 1 always means zooming in (showing less).

import { clamp } from "./music-math";
import { PitchHistoryBuffer, type PitchHistorySample } from "./pitch-history";

export const DEFAULT_MIDI_LOW = 36; // C2
export const DEFAULT_MIDI_HIGH = 84; // C6
export const MIN_PITCH_SPAN = 6;
export const MAX_PITCH_SPAN = 96;
export const MIDI_FLOOR = 0;
export const MIDI_CEILING = 127;

export const MIN_WINDOW_MS = 5_000;
export const DEFAULT_WINDOW_MS = 30_000;
export const MAX_WINDOW_MS = 120_000;
export const WINDOW_PRESETS_MS = [10_000, 30_000, 60_000, 120_000];

/** Fraction of the window left empty to the right of the live head. */
export const HEAD_LEAD_FRACTION = 0.08;
/** A held view may not be panned further back than this fraction of the window past the oldest sample. */
export const PAN_OVERSHOOT_FRACTION = 0.25;

/** Two voiced samples further apart than this are not joined by a line. */
export const MAX_JOIN_GAP_MS = 150;
/** A jump this large between neighbouring frames is a detector slip, not singing, and breaks the line. */
export const MAX_JOIN_JUMP_SEMITONES = 4;

export type PitchView = { lo: number; hi: number };
export type TimeView = { endMs: number; windowMs: number };
export type PlotBox = { left: number; top: number; width: number; height: number };
export type TimeBounds = { oldestMs: number; latestMs: number };

export function midiToY(midi: number, view: PitchView, box: PlotBox): number {
  return box.top + box.height * (1 - (midi - view.lo) / (view.hi - view.lo));
}

export function yToMidi(y: number, view: PitchView, box: PlotBox): number {
  return view.lo + (1 - (y - box.top) / box.height) * (view.hi - view.lo);
}

export function timeToX(tMs: number, time: TimeView, box: PlotBox): number {
  return box.left + box.width * (1 - (time.endMs - tMs) / time.windowMs);
}

export function xToTime(x: number, time: TimeView, box: PlotBox): number {
  return time.endMs - (1 - (x - box.left) / box.width) * time.windowMs;
}

export function clampWindowMs(windowMs: number): number {
  if (!Number.isFinite(windowMs)) return DEFAULT_WINDOW_MS;
  return clamp(windowMs, MIN_WINDOW_MS, MAX_WINDOW_MS);
}

/** The right-edge time of a live view: the newest sample plus a little empty lead for the head. */
export function liveEndMs(latestMs: number, windowMs: number): number {
  return latestMs + windowMs * HEAD_LEAD_FRACTION;
}

/**
 * Keeps a view's right edge inside the data that exists. The newest allowed
 * edge is the live edge; the oldest keeps a quarter of the window of recorded
 * pitch on screen so a pan can never leave the graph empty.
 */
export function clampEndMs(endMs: number, windowMs: number, bounds: TimeBounds): number {
  const newest = liveEndMs(bounds.latestMs, windowMs);
  const oldest = Math.min(bounds.oldestMs + windowMs * PAN_OVERSHOOT_FRACTION, newest);
  return clamp(endMs, oldest, newest);
}

/** Drag by `dxPx` (positive = finger moved right = look further back in time). */
export function panTime(time: TimeView, dxPx: number, plotWidthPx: number, bounds: TimeBounds): TimeView {
  if (!(plotWidthPx > 0)) return time;
  const endMs = time.endMs - (dxPx / plotWidthPx) * time.windowMs;
  return { windowMs: time.windowMs, endMs: clampEndMs(endMs, time.windowMs, bounds) };
}

/**
 * Zooms the time axis by `factor` while the moment under `anchorFrac` (0 =
 * left edge of the plot, 1 = right edge) stays under the same pixel.
 */
export function zoomTime(time: TimeView, factor: number, anchorFrac: number, bounds: TimeBounds): TimeView {
  if (!(factor > 0) || !Number.isFinite(factor)) return time;
  const frac = clamp(anchorFrac, 0, 1);
  const windowMs = clampWindowMs(time.windowMs / factor);
  const anchorMs = time.endMs - (1 - frac) * time.windowMs;
  const endMs = anchorMs + (1 - frac) * windowMs;
  return { windowMs, endMs: clampEndMs(endMs, windowMs, bounds) };
}

/** Pans the pitch axis. Dragging down (positive `dyPx`) reveals higher notes. */
export function panPitch(view: PitchView, dyPx: number, plotHeightPx: number): PitchView {
  if (!(plotHeightPx > 0)) return view;
  const span = view.hi - view.lo;
  return fitPitchView(view.lo + (dyPx / plotHeightPx) * span, view.hi + (dyPx / plotHeightPx) * span);
}

/** Zooms the pitch axis by `factor` around `anchorFrac` (0 = bottom of the plot, 1 = top). */
export function zoomPitch(view: PitchView, factor: number, anchorFrac: number): PitchView {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const frac = clamp(anchorFrac, 0, 1);
  const span = clamp((view.hi - view.lo) / factor, MIN_PITCH_SPAN, MAX_PITCH_SPAN);
  const anchor = view.lo + frac * (view.hi - view.lo);
  return fitPitchView(anchor - frac * span, anchor + (1 - frac) * span);
}

/** Slides a view back inside C-1..G9 without changing its span. */
export function fitPitchView(lo: number, hi: number): PitchView {
  const span = clamp(hi - lo, MIN_PITCH_SPAN, MAX_PITCH_SPAN);
  const start = clamp(lo, MIDI_FLOOR, MIDI_CEILING - span);
  return { lo: start, hi: start + span };
}

/** Margin, in semitones, left above and below a stored range when the graph scales to it. */
export function rangeMargin(low: number, high: number): number {
  return Math.max(3, Math.round((high - low) * 0.12));
}

/**
 * The pitch axis a fresh graph opens with: C2 to C6, or, once the singer has
 * recorded a range, that range with a margin either side.
 */
export function defaultPitchView(range: { low: number; high: number } | null): PitchView {
  if (!range) return { lo: DEFAULT_MIDI_LOW, hi: DEFAULT_MIDI_HIGH };
  const margin = rangeMargin(range.low, range.high);
  return fitPitchView(range.low - margin, range.high + margin);
}

/** Pointer-distance ratio for a pinch; above 1 means the fingers spread (zoom in). */
export function pinchFactor(previousDistance: number, nextDistance: number): number {
  if (!(previousDistance > 0) || !(nextDistance > 0)) return 1;
  return nextDistance / previousDistance;
}

/** A pinch whose fingers sit more up-and-down than side-to-side zooms pitch; otherwise it zooms time. */
export function pinchAxis(dx: number, dy: number): "time" | "pitch" {
  return Math.abs(dy) > Math.abs(dx) * 1.2 ? "pitch" : "time";
}

/** Wheel notches to a zoom factor: scrolling up (negative deltaY) zooms in. */
export function wheelZoomFactor(deltaY: number): number {
  return clamp(Math.exp(-deltaY * 0.0015), 0.5, 2);
}

/** The continuous pitch of a history sample, or null for an unvoiced gap. */
export function samplePitch(sample: PitchHistorySample): number | null {
  if (sample.midi === null || sample.cents === null) return null;
  return sample.midi + sample.cents / 100;
}

export type VoicedPoint = { tMs: number; pitch: number; cents: number; locked: boolean };

/**
 * Splits samples into separately drawn runs. A run ends at an unvoiced
 * sample, at a time gap longer than `maxGapMs` between two voiced samples,
 * and at a pitch jump larger than `maxJump` semitones between neighbours
 * (an octave slip from the detector, not a note a voice can reach in one
 * 30 ms frame). A run of one point is dropped; there is nothing to draw.
 */
export function splitIntoRuns(
  samples: PitchHistorySample[],
  maxGapMs: number = MAX_JOIN_GAP_MS,
  maxJump: number = MAX_JOIN_JUMP_SEMITONES,
): VoicedPoint[][] {
  const runs: VoicedPoint[][] = [];
  let current: VoicedPoint[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (const sample of samples) {
    const pitch = samplePitch(sample);
    if (pitch === null) {
      flush();
      continue;
    }
    const last = current.length ? current[current.length - 1] : null;
    if (last && (sample.tMs - last.tMs > maxGapMs || Math.abs(pitch - last.pitch) > maxJump)) flush();
    current.push({ tMs: sample.tMs, pitch, cents: sample.cents as number, locked: sample.locked === true });
  }
  flush();
  return runs;
}

export type CentsClass = "in" | "near" | "off";

/** The same three bands the tuner's own history line uses: within tolerance, within three times it, beyond. */
export function centsClass(cents: number, toleranceCents: number): CentsClass {
  const magnitude = Math.abs(cents);
  if (magnitude <= toleranceCents) return "in";
  if (magnitude <= toleranceCents * 3) return "near";
  return "off";
}

export type PitchTick = {
  midi: number;
  /** A C: drawn heavier than the semitone guides. */
  octave: boolean;
  /** Whether a note name is written at this tick. */
  labelled: boolean;
  /** Whether a guide line is drawn at this tick. */
  guide: boolean;
};

/** Pixels of height per semitone at which every semitone, then each natural, then C-E-G, then only C is labelled. */
const LABEL_ALL_PX = 17;
const LABEL_NATURALS_PX = 10;
const LABEL_TRIAD_PX = 5.5;
const GUIDE_PX = 3.5;
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const TRIAD_PITCH_CLASSES = [0, 4, 7];

export function pitchTicks(view: PitchView, plotHeightPx: number): PitchTick[] {
  const pxPerSemitone = plotHeightPx / (view.hi - view.lo);
  const ticks: PitchTick[] = [];
  const first = Math.ceil(view.lo - 1e-9);
  const last = Math.floor(view.hi + 1e-9);
  for (let midi = first; midi <= last; midi += 1) {
    const pc = ((midi % 12) + 12) % 12;
    const octave = pc === 0;
    const labelled = octave
      || (pxPerSemitone >= LABEL_ALL_PX)
      || (pxPerSemitone >= LABEL_NATURALS_PX && NATURAL_PITCH_CLASSES.indexOf(pc) >= 0)
      || (pxPerSemitone >= LABEL_TRIAD_PX && TRIAD_PITCH_CLASSES.indexOf(pc) >= 0);
    ticks.push({ midi, octave, labelled, guide: octave || pxPerSemitone >= GUIDE_PX });
  }
  return ticks;
}

const TIME_STEPS_S = [1, 2, 5, 10, 15, 30, 60];

/** Seconds between labelled time ticks, chosen so roughly four to eight fit the window. */
export function timeTickStepSeconds(windowMs: number): number {
  const target = windowMs / 1000 / 6;
  for (const step of TIME_STEPS_S) {
    if (step >= target) return step;
  }
  return TIME_STEPS_S[TIME_STEPS_S.length - 1];
}

/** "-10 s" / "-1:30" style labels for the time axis, counted back from the live edge. */
export function formatAgo(seconds: number): string {
  const whole = Math.round(Math.abs(seconds));
  if (whole === 0) return "now";
  if (whole < 60) return `-${whole} s`;
  return `-${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Whole cents with an explicit sign, e.g. "+4" or "-12" (a true minus keeps the figures aligned). */
export function formatSignedCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

/** Splits a continuous pitch into its nearest semitone and the cents either side of it. */
export function splitPitch(pitch: number): { midi: number; cents: number } {
  const midi = Math.round(pitch);
  return { midi, cents: (pitch - midi) * 100 };
}

// -- Feed from the tuner ---------------------------------------------------------

/** Called once per analysis tick (~30 ms) with the sample just pushed to the vocal buffer. */
export type VocalFrameListener = (sample: PitchHistorySample) => void;

export type VocalGraphSource = {
  /** Two minutes of unsmoothed pitch readings; unvoiced frames are gaps. Callers read it and call `clear`. */
  buffer: PitchHistoryBuffer;
  /** Runs `listener` after each analysis tick, from the tuner's own rAF loop. Returns the unsubscribe function. */
  subscribe: (listener: VocalFrameListener) => () => void;
  /** Empties the vocal buffer only; the Tune view's own history is unaffected. */
  clear: () => void;
};

/**
 * The long ring buffer and listener list the tuner's sampling loop feeds.
 * `publish` appends a sample and calls every listener; a listener that throws
 * is skipped so a painting bug can never stop the tuner.
 */
export function createVocalChannel(capacity: number): { source: VocalGraphSource; publish: (sample: PitchHistorySample) => void } {
  const buffer = new PitchHistoryBuffer(capacity);
  const listeners = new Set<VocalFrameListener>();
  return {
    source: {
      buffer,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      clear: () => buffer.clear(),
    },
    publish: (sample) => {
      buffer.push(sample);
      listeners.forEach((listener) => {
        try { listener(sample); } catch { /* keep listening */ }
      });
    },
  };
}
