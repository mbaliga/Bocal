// Canvas painting for the Vocal workspace's live pitch graph. Like
// pitch-history-canvas.ts it talks to a 2D context and to computed CSS custom
// properties, so it is not unit tested; every number it uses to place things
// comes from vocal-graph.ts, which is.
//
// Called from the tuner's own rAF loop (through the vocal frame listeners in
// useTuner) and, for a held or idle graph, directly after a pan, zoom or
// resize. It repaints the whole canvas on each call; there is no partial
// state to keep in sync.

import { fullNoteLabel } from "./notation";
import type { NotationSystem } from "./notation";
import { clamp } from "./music-math";
import type { PitchHistorySample } from "./pitch-history";
import {
  centsClass,
  formatAgo,
  formatSignedCents,
  midiToY,
  pitchTicks,
  splitIntoRuns,
  splitPitch,
  timeTickStepSeconds,
  timeToX,
  type CentsClass,
  type PitchView,
  type PlotBox,
  type TimeView,
} from "./vocal-graph";
import type { MelodySegment } from "./melody-line";
import { glidePath, glidePitchAt, type GlideAttempt, type Onset } from "./vocal-warmups";
import type { VocalRange } from "./vocal-range";

export type VocalGraphTheme = {
  ink: string;
  muted: string;
  line: string;
  lineStrong: string;
  inTune: string;
  near: string;
  off: string;
  accent: string;
  mark: string;
};

const FALLBACK_THEME: VocalGraphTheme = {
  ink: "#f5f3eb",
  muted: "#b4b0a6",
  line: "#2c2e36",
  lineStrong: "#4a4d58",
  inTune: "#08fed5",
  near: "#f2b84b",
  off: "#ff6e6e",
  accent: "#08fed5",
  mark: "#c9bfff",
};

/**
 * Reads the stage's scoped colour tokens (defined on `.vocal-stage` in
 * styles/vocal.css, light-on-dark in both app themes) off the canvas, so the
 * palette lives in one CSS place and the in-tune / near / off colours stay
 * the ones the tuner's own history line uses.
 */
export function readVocalGraphTheme(element: Element): VocalGraphTheme {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--vg-ink", FALLBACK_THEME.ink),
    muted: read("--vg-muted", FALLBACK_THEME.muted),
    line: read("--vg-line", FALLBACK_THEME.line),
    lineStrong: read("--vg-line-strong", FALLBACK_THEME.lineStrong),
    inTune: read("--vg-in", FALLBACK_THEME.inTune),
    near: read("--vg-near", FALLBACK_THEME.near),
    off: read("--vg-off", FALLBACK_THEME.off),
    accent: read("--vg-accent", FALLBACK_THEME.accent),
    mark: read("--vg-mark", FALLBACK_THEME.mark),
  };
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const hex = match[1];
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`;
}

/**
 * A target melody on the graph. While a pass runs (and after it, until it is
 * cleared) `segments` are drawn as bands and `view` pins the time window to the
 * pass. While a melody is being edited `draft` lists the pitches typed so far.
 */
export type MelodyOverlay = {
  segments: MelodySegment[];
  /** Half-width of each band, in cents. */
  bandCents: number;
  /** The fixed time window for the pass, or null when none is running. */
  view: TimeView | null;
  /** The pitch axis the pass needs, or null to keep the graph's own. */
  pitch: PitchView | null;
  /** The note numbers of a melody being edited, drawn as numbered guide lines. */
  draft: number[];
};

/** Everything the warm-ups and the range finder ask the graph to draw on top of the pitch line. */
export type GraphOverlay = {
  sustain: { midi: number; bandCents: number; reached: boolean } | null;
  glide: GlideAttempt | null;
  onsets: Onset[];
  /** The first note of the range finder, kept on screen while the second is recorded. */
  capturedLow: number | null;
  /** The target melody, if one is being edited or played. */
  melody?: MelodyOverlay | null;
};

export const EMPTY_OVERLAY: GraphOverlay = { sustain: null, glide: null, onsets: [], capturedLow: null, melody: null };

export type DrawVocalGraphInput = {
  samples: PitchHistorySample[];
  time: TimeView;
  pitch: PitchView;
  /** Time of the newest reading; the time axis counts back from it. */
  anchorMs: number;
  toleranceCents: number;
  notation: NotationSystem;
  saTonic: number;
  theme: VocalGraphTheme;
  range: VocalRange | null;
  overlay: GraphOverlay;
  /** The live head, or null when held, idle or silent. */
  head: { pitch: number; tMs: number } | null;
  reducedMotion: boolean;
  nowMs: number;
};

const GUTTER_LEFT = 50;
const GUTTER_RIGHT = 12;
const GUTTER_TOP = 10;
const GUTTER_BOTTOM = 22;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function plotBoxFor(cssWidth: number, cssHeight: number): PlotBox {
  return {
    left: GUTTER_LEFT,
    top: GUTTER_TOP,
    width: Math.max(1, cssWidth - GUTTER_LEFT - GUTTER_RIGHT),
    height: Math.max(1, cssHeight - GUTTER_TOP - GUTTER_BOTTOM),
  };
}

function colourFor(kind: CentsClass, theme: VocalGraphTheme): string {
  return kind === "in" ? theme.inTune : kind === "near" ? theme.near : theme.off;
}

/** Sizes the backing store to the element (capped at 3x, as the tuner's history canvas does) and returns the CSS size. */
export function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 240;
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function drawVocalGraph(canvas: HTMLCanvasElement, input: DrawVocalGraphInput): PlotBox {
  const prepared = prepareCanvas(canvas);
  const fallbackBox = plotBoxFor(canvas.clientWidth || 320, canvas.clientHeight || 240);
  if (!prepared) return fallbackBox;
  const { ctx, width, height } = prepared;
  const box = plotBoxFor(width, height);
  const { theme, time, pitch } = input;
  const yOf = (midi: number) => midiToY(midi, pitch, box);
  const xOf = (tMs: number) => timeToX(tMs, time, box);
  const right = box.left + box.width;
  const bottom = box.top + box.height;

  // Range band: the notes the singer recorded, shaded behind everything.
  if (input.range) {
    const top = clamp(yOf(input.range.high + 0.5), box.top, bottom);
    const base = clamp(yOf(input.range.low - 0.5), box.top, bottom);
    if (base > top) {
      ctx.fillStyle = withAlpha(theme.accent, 0.1);
      ctx.fillRect(box.left, top, box.width, base - top);
      ctx.strokeStyle = withAlpha(theme.accent, 0.45);
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      for (const edge of [top, base]) {
        ctx.beginPath();
        ctx.moveTo(box.left, edge + 0.5);
        ctx.lineTo(right, edge + 0.5);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // Semitone guides, heavier octave lines, and the note names on the left.
  ctx.font = `10.5px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (const tick of pitchTicks(pitch, box.height)) {
    const y = Math.round(yOf(tick.midi)) + 0.5;
    if (y < box.top - 1 || y > bottom + 1) continue;
    if (tick.guide) {
      ctx.strokeStyle = tick.octave ? theme.lineStrong : theme.line;
      ctx.lineWidth = tick.octave ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    if (tick.labelled && y > box.top + 4 && y < bottom - 4) {
      ctx.fillStyle = tick.octave ? theme.ink : theme.muted;
      ctx.font = `${tick.octave ? "600 " : ""}10.5px ${FONT}`;
      ctx.fillText(fullNoteLabel(tick.midi, input.notation, input.saTonic), box.left - 6, y);
    }
  }

  // Time ticks, counted back from the newest reading.
  const stepMs = timeTickStepSeconds(time.windowMs) * 1000;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `10.5px ${FONT}`;
  for (let k = 0; k < 400; k += 1) {
    const t = input.anchorMs - k * stepMs;
    const x = xOf(t);
    if (x < box.left) break;
    if (x > right) continue;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, box.top);
    ctx.lineTo(Math.round(x) + 0.5, bottom);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatAgo(k * stepMs / 1000), clamp(x, box.left + 14, right - 14), bottom + 5);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.width, box.height);
  ctx.clip();

  // Sustain target band.
  const sustain = input.overlay.sustain;
  if (sustain) {
    const bandSemitones = sustain.bandCents / 100;
    const top = yOf(sustain.midi + bandSemitones);
    const base = yOf(sustain.midi - bandSemitones);
    ctx.fillStyle = withAlpha(theme.accent, sustain.reached ? 0.26 : 0.15);
    ctx.fillRect(box.left, top, box.width, Math.max(2, base - top));
    ctx.strokeStyle = withAlpha(theme.accent, 0.7);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(box.left, yOf(sustain.midi) + 0.5);
    ctx.lineTo(right, yOf(sustain.midi) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Held-open first note of the range finder.
  if (input.overlay.capturedLow !== null) {
    const y = yOf(input.overlay.capturedLow);
    ctx.strokeStyle = withAlpha(theme.mark, 0.8);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(box.left, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Target melody: one band per note along the time axis, a numbered guide
  // line per pitch while one is being edited, and a "now" line during a pass.
  const melody = input.overlay.melody;
  if (melody) {
    const bandSemitones = melody.bandCents / 100;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const segment of melody.segments) {
      const x0 = xOf(segment.startMs);
      const x1 = xOf(segment.endMs);
      if (x1 < box.left || x0 > right) continue;
      const top = yOf(segment.midi + bandSemitones);
      const base = yOf(segment.midi - bandSemitones);
      const bandHeight = Math.max(3, base - top);
      ctx.fillStyle = withAlpha(theme.mark, 0.2);
      ctx.fillRect(x0, top, Math.max(1, x1 - x0 - 1), bandHeight);
      ctx.strokeStyle = withAlpha(theme.mark, 0.85);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x0 + 0.5, top + 0.5, Math.max(1, x1 - x0 - 2), bandHeight);
      ctx.strokeStyle = withAlpha(theme.mark, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, yOf(segment.midi) + 0.5);
      ctx.lineTo(x1, yOf(segment.midi) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      if (x1 - x0 > 26) {
        ctx.fillStyle = theme.ink;
        ctx.fillText(fullNoteLabel(segment.midi, input.notation, input.saTonic), Math.max(x0, box.left) + 4, Math.max(box.top + 2, top - 14));
      }
    }
    if (melody.segments.length > 0 && melody.view) {
      const first = melody.segments[0].startMs;
      const last = melody.segments[melody.segments.length - 1].endMs;
      if (input.nowMs >= first - 1500 && input.nowMs <= last + 600) {
        const x = xOf(input.nowMs);
        ctx.strokeStyle = withAlpha(theme.ink, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, box.top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
    }
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    melody.draft.forEach((midi, index) => {
      const y = yOf(midi);
      ctx.strokeStyle = withAlpha(theme.mark, 0.7);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(box.left, y + 0.5);
      ctx.lineTo(right, y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = theme.mark;
      ctx.fillText(String(index + 1), right - 4 - (index % 6) * 16, y - 8);
    });
  }

  // Glide siren path, drawn as a soft wide band with a dashed centre line.
  const glide = input.overlay.glide;
  if (glide) {
    const points = glidePath(glide);
    const trace = () => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xOf(point.tMs);
        const y = yOf(point.pitch);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = withAlpha(theme.mark, 0.22);
    ctx.lineWidth = Math.max(8, Math.abs(yOf(1) - yOf(0)) * 0.9);
    trace();
    ctx.stroke();
    ctx.strokeStyle = withAlpha(theme.mark, 0.9);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    trace();
    ctx.stroke();
    ctx.setLineDash([]);
    // Where the path is "now", so the singer can see which part to sing next.
    const here = glidePitchAt(glide, input.nowMs);
    if (here !== null) {
      ctx.fillStyle = theme.mark;
      ctx.beginPath();
      ctx.arc(xOf(input.nowMs), yOf(here), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The pitch line: one path per run of the same colour band, so a long
  // phrase is a handful of strokes rather than one per frame.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 2.6;
  for (const run of splitIntoRuns(input.samples)) {
    let kind: CentsClass | null = null;
    let previous = run[0];
    ctx.beginPath();
    ctx.moveTo(xOf(previous.tMs), yOf(previous.pitch));
    for (let index = 1; index < run.length; index += 1) {
      const point = run[index];
      const segmentKind = centsClass((previous.cents + point.cents) / 2, input.toleranceCents);
      if (kind !== null && segmentKind !== kind) {
        ctx.strokeStyle = colourFor(kind, theme);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xOf(previous.tMs), yOf(previous.pitch));
      }
      kind = segmentKind;
      ctx.lineTo(xOf(point.tMs), yOf(point.pitch));
      previous = point;
    }
    if (kind !== null) {
      ctx.strokeStyle = colourFor(kind, theme);
      ctx.stroke();
    }
  }

  // Attack ticks for "Start cleanly".
  ctx.strokeStyle = theme.mark;
  ctx.fillStyle = theme.mark;
  ctx.lineWidth = 2;
  for (const onset of input.overlay.onsets) {
    const x = xOf(onset.tMs);
    if (x < box.left - 4 || x > right + 4) continue;
    const y = yOf(onset.pitch);
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, bottom);
    ctx.lineTo(x + 5, bottom);
    ctx.lineTo(x, bottom - 8);
    ctx.closePath();
    ctx.fill();
  }

  // The live head: a glowing dot at the newest pitch with a readout beside it.
  if (input.head) {
    const x = xOf(input.head.tMs);
    const y = yOf(input.head.pitch);
    const { midi, cents } = splitPitch(input.head.pitch);
    const colour = colourFor(centsClass(cents, input.toleranceCents), theme);
    const pulse = input.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(input.nowMs / 320);
    const radius = 15 + pulse * 5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, withAlpha(colour, 0.55));
    glow.addColorStop(1, withAlpha(colour, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();

    const label = `${fullNoteLabel(midi, input.notation, input.saTonic)}  ${formatSignedCents(cents)}¢`;
    ctx.font = `600 12px ${FONT}`;
    const textWidth = ctx.measureText(label).width;
    const chipWidth = textWidth + 14;
    const onLeft = x + 12 + chipWidth > right;
    const chipX = onLeft ? x - 12 - chipWidth : x + 12;
    const chipY = clamp(y - 11, box.top + 2, bottom - 24);
    ctx.fillStyle = "rgba(10, 11, 15, 0.82)";
    ctx.beginPath();
    ctx.rect(chipX, chipY, chipWidth, 22);
    ctx.fill();
    ctx.strokeStyle = withAlpha(colour, 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(chipX + 0.5, chipY + 0.5, chipWidth - 1, 21);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, chipX + 7, chipY + 11.5);
  }

  ctx.restore();
  return box;
}
