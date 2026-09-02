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
import { STAFF_BOTTOM_LINE, type Clef } from "./StaffNote";

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
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
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

  ctx.fillStyle = theme.muted;
  ctx.font = `${Math.round(spacing * 1.7)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(clef === "treble" ? "𝄞" : "𝄢", 2, top + spacing * 2);

  const segments = detectStableSegments(samples);
  for (const segment of segments) {
    const startSample = samples[segment.startIndex];
    const endSample = samples[segment.endIndex];
    if (endSample.tMs < nowMs - windowMs) continue;
    const xStart = timeToX(Math.max(startSample.tMs, nowMs - windowMs));
    const xEnd = timeToX(endSample.tMs);
    const xCenter = (xStart + xEnd) / 2;

    const step = octaveOf(segment.midi) * 7 + spellingFor(segment.midi).letter - bottom;
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

    // Sharp/flat shading, TE's "Note Staff" behaviour: a notehead sitting
    // right on target reads neutral, and leans warm/cool the further off it is.
    const color = Math.abs(segment.meanCents) < 3 ? theme.ink : segment.meanCents > 0 ? theme.sharp : theme.flat;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(xCenter, y, Math.max(3.2, spacing * 0.42), Math.max(2.4, spacing * 0.32), -0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
