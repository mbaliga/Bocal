// Canvas rendering for the tuner's live pitch-history graph: a scrolling
// cents-vs-time line, or a staff-mode alternative that plots the written
// note instead.
//
// Split out from pitch-history.ts (the ring buffer + stable-segment logic,
// which is unit-tested and DOM-free) because this module talks directly to
// a <canvas> 2D context and to computed CSS custom properties -- neither of
// which exist under Node's test runner. It's called from the same rAF loop
// the live tuner already runs (see the sample() loop in page.tsx), never
// from its own timer.

import { octaveOf, spellingFor } from "./notation";
import { detectStableSegments, type PitchHistoryBuffer } from "./pitch-history";
import {
  BASS_CLEF,
  FLAT_GLYPH_PATH,
  SHARP_GLYPH_PATHS,
  STAFF_BOTTOM_LINE,
  STAFF_LINE_SPACING,
  TREBLE_CLEF,
  type Clef,
} from "./StaffNote";

export type PitchHistoryMode = "line" | "staff";

export type PitchHistoryTheme = {
  ink: string;
  muted: string;
  line: string;
  cyan: string;
  sharp: string;
  flat: string;
};

/**
 * Reads the app's design tokens straight off the DOM so the graph is
 * legible in both themes without hard-coding a palette here -- globals.css
 * is the single source of truth for what "ink" or "cyan" mean in light vs
 * dark mode, and this just asks the browser what they resolved to.
 */
export function readPitchHistoryTheme(root: HTMLElement = document.documentElement): PitchHistoryTheme {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };
  const isLight = root.getAttribute("data-theme") === "light";
  return {
    ink: read("--ink", "#f5f3eb"),
    muted: read("--muted", "#9c9b98"),
    line: read("--line", "#28282c"),
    cyan: read("--cyan", "#08fed5"),
    // Sharp/flat shading needs to read clearly against both the dark studio
    // background and the light theme's cream one, so these two are picked
    // by contrast rather than pulled from a token meant for something else.
    sharp: isLight ? "#c14a3a" : "#ff6e6e",
    flat: isLight ? "#a8790f" : "#f2b84b",
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorForCents(cents: number, toleranceCents: number, theme: PitchHistoryTheme): string {
  const magnitude = Math.abs(cents);
  if (magnitude <= toleranceCents) return theme.cyan;
  if (magnitude <= toleranceCents * 3) return theme.flat;
  return theme.sharp;
}

export type DrawPitchHistoryOptions = {
  mode: PitchHistoryMode;
  clef: Clef;
  /** The active Precision setting's tolerance in cents (10, 5, or 2). */
  toleranceCents: number;
  /** How much history the graph shows, in milliseconds (the brief's ~10s). */
  windowMs: number;
  /** The right edge of the plotted window -- the latest sample's time, or
   *  the current clock while live. */
  nowMs: number;
  theme: PitchHistoryTheme;
};

/**
 * Draws the full graph from scratch every call. Resizing the backing buffer
 * to match the canvas's current on-screen size only when it actually
 * changed keeps this cheap enough to run every ~30ms sample tick, and means
 * a full redraw (rather than an incremental one) is the simplest correct
 * approach -- there's no partial state to keep in sync.
 */
export function drawPitchHistory(canvas: HTMLCanvasElement, buffer: PitchHistoryBuffer, options: DrawPitchHistoryOptions) {
  // Clamped at 3 rather than 2 -- the canvas is a small, fixed 320x104 CSS-px
  // area, so even 3x stays well under 1 MP, and 2x left the 9.5px axis
  // labels and 1.7px trace noticeably soft on the 2.6-3.5x phones the
  // 412x915 target represents (tuner.md finding "DPR capped at 2").
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = canvas.clientHeight || 96;
  const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
  const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const samples = buffer.toArray();
  if (options.mode === "staff") drawStaffMode(ctx, samples, cssWidth, cssHeight, options);
  else drawLineMode(ctx, samples, cssWidth, cssHeight, options);
}

const MARGIN_LEFT = 30;
const MARGIN_RIGHT = 6;

function drawLineMode(
  ctx: CanvasRenderingContext2D,
  samples: ReturnType<PitchHistoryBuffer["toArray"]>,
  width: number,
  height: number,
  options: DrawPitchHistoryOptions,
) {
  const { nowMs, windowMs, toleranceCents, theme } = options;
  const plotWidth = Math.max(1, width - MARGIN_LEFT - MARGIN_RIGHT);
  const plotTop = 8;
  const plotHeight = Math.max(1, height - plotTop - 6);
  const centsToY = (cents: number) => plotTop + plotHeight * (1 - (clamp(cents, -50, 50) + 50) / 100);
  const timeToX = (t: number) => MARGIN_LEFT + plotWidth * (1 - (nowMs - t) / windowMs);

  // The in-tune band, shaded behind everything else so the trace draws over it.
  ctx.fillStyle = withAlpha(theme.cyan, 0.1);
  const bandTop = centsToY(toleranceCents);
  const bandBottom = centsToY(-toleranceCents);
  ctx.fillRect(MARGIN_LEFT, bandTop, plotWidth, bandBottom - bandTop);

  // Gridlines at -50/-25/0/+25/+50, with the centre line a touch bolder.
  ctx.strokeStyle = theme.line;
  [-50, -25, 0, 25, 50].forEach((value) => {
    ctx.lineWidth = value === 0 ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, centsToY(value));
    ctx.lineTo(width - MARGIN_RIGHT, centsToY(value));
    ctx.stroke();
  });

  ctx.fillStyle = theme.muted;
  ctx.font = "9.5px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  [-50, -25, 0, 25, 50].forEach((value) => {
    ctx.fillText(`${value > 0 ? "+" : ""}${value}`, MARGIN_LEFT - 5, centsToY(value));
  });

  // The trace itself, one short coloured segment per pair of consecutive
  // samples so it can shade by |cents| against the tolerance as it goes.
  // A gap (unvoiced frame, or a sample that has scrolled out of the window)
  // breaks the line rather than joining across the silence.
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.7;
  let previous: { x: number; y: number; cents: number } | null = null;
  for (const sample of samples) {
    if (sample.cents === null || sample.tMs < nowMs - windowMs) {
      previous = null;
      continue;
    }
    const x = timeToX(sample.tMs);
    const y = centsToY(sample.cents);
    if (previous) {
      ctx.strokeStyle = colorForCents((previous.cents + sample.cents) / 2, toleranceCents, theme);
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    previous = { x, y, cents: sample.cents };
  }
}

function drawStaffMode(
  ctx: CanvasRenderingContext2D,
  samples: ReturnType<PitchHistoryBuffer["toArray"]>,
  width: number,
  height: number,
  options: DrawPitchHistoryOptions,
) {
  const { clef, nowMs, windowMs, theme } = options;
  const plotWidth = Math.max(1, width - MARGIN_LEFT - MARGIN_RIGHT);
  // Same 5-line, evenly-spaced staff StaffNote.tsx draws, just scaled to fit
  // the graph's height and laid out horizontally instead of around one note.
  const spacing = clamp((height - 26) / 4, 6, 12);
  const top = (height - spacing * 4) / 2;
  const bottom = STAFF_BOTTOM_LINE[clef];
  const timeToX = (t: number) => MARGIN_LEFT + plotWidth * (1 - (nowMs - t) / windowMs);
  const stepToY = (step: number) => top + 4 * spacing - (step * spacing) / 2;

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = top + i * spacing;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, y);
    ctx.lineTo(width - MARGIN_RIGHT, y);
    ctx.stroke();
  }

  // Path-based clef, scaled from StaffNote's own 10px-spacing geometry down
  // to this graph's (smaller, variable) spacing -- drawing the same
  // hand-authored strokes StaffNote.tsx uses rather than the Unicode 𝄞/𝄢
  // glyphs, which tuner.md flags as a coin-flip on Android WebView (the
  // component this module borrows the geometry from explicitly avoids them
  // for that reason).
  const clefScale = spacing / STAFF_LINE_SPACING;
  ctx.save();
  ctx.translate(6, top + spacing * 3);
  ctx.scale(clefScale, clefScale);
  ctx.strokeStyle = theme.muted;
  ctx.lineWidth = 2.6 / clefScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(clef === "treble" ? TREBLE_CLEF : BASS_CLEF));
  if (clef === "bass") {
    ctx.fillStyle = theme.muted;
    ctx.beginPath();
    ctx.arc(18, 5, 1.9, 0, Math.PI * 2);
    ctx.arc(18, 15, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const FOLD_LIMIT = 12;
  const segments = detectStableSegments(samples);
  for (const segment of segments) {
    const startSample = samples[segment.startIndex];
    const endSample = samples[segment.endIndex];
    if (endSample.tMs < nowMs - windowMs) continue;
    const xStart = timeToX(Math.max(startSample.tMs, nowMs - windowMs));
    const xEnd = timeToX(endSample.tMs);
    const xCenter = (xStart + xEnd) / 2;

    const rawStep = octaveOf(segment.midi) * 7 + spellingFor(segment.midi).letter - bottom;
    // Fold notes far outside the staff back an octave with an 8va/8vb badge
    // rather than drawing them off the top/bottom of a fixed-height canvas
    // (tuner.md: "any step >= 13 ... lands at y < 0 and is drawn outside the
    // canvas"), the same fix StaffNote.tsx applies to the live readout.
    let step = rawStep;
    let octaveTag: "8va" | "8vb" | null = null;
    while (step > FOLD_LIMIT) { step -= 7; octaveTag = "8va"; }
    while (step < -FOLD_LIMIT) { step += 7; octaveTag = "8vb"; }
    const y = stepToY(step);

    // Ledger lines above or below the staff, same construction StaffNote.tsx
    // uses: every other half-step outside the 0..8 range that the note sits on.
    const ledgerSteps: number[] = [];
    if (step < 0) for (let s = -2; s >= step; s -= 2) ledgerSteps.push(s);
    if (step > 8) for (let s = 10; s <= step; s += 2) ledgerSteps.push(s);
    if (ledgerSteps.length) {
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1.2;
      const half = Math.max(4, spacing * 0.9);
      for (const s of ledgerSteps) {
        const ly = stepToY(s);
        ctx.beginPath();
        ctx.moveTo(xCenter - half, ly);
        ctx.lineTo(xCenter + half, ly);
        ctx.stroke();
      }
    }

    // Accidental, drawn immediately left of the notehead when the written
    // spelling calls for one -- previously omitted entirely, so an adjacent
    // sharp/natural or flat/natural pair (e.g. F#/F, Bb/B) drew identical
    // noteheads on the same line (tuner.md: "the staff history cannot tell
    // a player which of two adjacent semitones they were on").
    const accidental = spellingFor(segment.midi).accidental;
    if (accidental !== 0) {
      const glyphScale = spacing / STAFF_LINE_SPACING;
      ctx.save();
      ctx.translate(xCenter - Math.max(9, spacing * 0.9), y);
      ctx.scale(glyphScale, glyphScale);
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = (accidental > 0 ? 1.5 : 1.6) / glyphScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (accidental > 0) {
        for (const d of SHARP_GLYPH_PATHS) ctx.stroke(new Path2D(d));
      } else {
        ctx.stroke(new Path2D(FLAT_GLYPH_PATH));
      }
      ctx.restore();
    }

    // Sharp/flat shading, TE's "Note Staff" behaviour: a notehead sitting
    // right on target reads neutral, and leans warm/cool the further off it is.
    const color = Math.abs(segment.meanCents) < 3 ? theme.ink : segment.meanCents > 0 ? theme.sharp : theme.flat;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(xCenter, y, Math.max(3.2, spacing * 0.42), Math.max(2.4, spacing * 0.32), -0.35, 0, Math.PI * 2);
    ctx.fill();

    if (octaveTag) {
      ctx.fillStyle = theme.muted;
      ctx.font = `italic ${Math.max(8, Math.round(spacing * 0.85))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(octaveTag, xCenter, octaveTag === "8va" ? y - spacing * 1.6 : y + spacing * 1.6);
    }
  }
}
