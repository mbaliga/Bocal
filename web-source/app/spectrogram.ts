/**
 * Log-frequency waterfall spectrogram for the live Analyze view's fourth
 * mode.
 *
 * Split into DOM-free maths (frequency<->pixel mapping, note-name ticks,
 * the magnitude->colour ramp) that `spectrogram.test.mjs` exercises without
 * a canvas, and a small `SpectrogramPainter` class that does the actual
 * drawing -- same split as pitch-history.ts / pitch-history-canvas.ts.
 *
 * The painter never allocates a second canvas or a fresh typed array per
 * frame: it scrolls the existing 2D context one column left by drawing the
 * canvas onto itself (a standard, cheap way to implement a waterfall), then
 * paints exactly one new column of pixels at the right edge from whatever
 * Float32Array the caller already reused for `getFloatFrequencyData`. No
 * second AnalyserNode is created; AnalysisView passes the same analyser and
 * frequency-data buffer it already uses for the Harmonics mode.
 */

export type SpectrogramTheme = {
  bg: string;
  quiet: string;
  loud: string;
  ink: string;
  muted: string;
  line: string;
};

const FALLBACK_THEME: SpectrogramTheme = {
  bg: "#0b0b0d",
  quiet: "#211d46",
  loud: "#08fed5",
  ink: "#f5f3eb",
  muted: "#8a8a86",
  line: "#3a3a40",
};

/**
 * Reads the spectrogram's own CSS custom properties off `root` (in practice
 * the `.analysis-canvas-wrap` element, see styles/analysis.css). These are
 * fixed light-on-dark values, not swapped under `html[data-theme="light"]`
 * -- the same reasoning as the `.harmonics-overlay` block already in that
 * file: every mode in this view paints onto a deliberately dark canvas
 * backdrop in both themes (`#0b0b0d`, set in AnalysisView's draw()), so a
 * ramp built from the page's normal light/dark tokens would go dark-on-dark
 * or otherwise illegible in light mode. Still "paint from CSS tokens" in the
 * literal sense this package's convention asks for: change the tokens in
 * one place in analysis.css and every consumer of this function follows,
 * exactly like readPitchHistoryTheme() does for the tuner's graph.
 */
export function readSpectrogramTheme(root: Element = document.documentElement): SpectrogramTheme {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--spectrogram-bg", FALLBACK_THEME.bg),
    quiet: read("--spectrogram-quiet", FALLBACK_THEME.quiet),
    loud: read("--spectrogram-loud", FALLBACK_THEME.loud),
    ink: read("--spectrogram-ink", FALLBACK_THEME.ink),
    muted: read("--spectrogram-muted", FALLBACK_THEME.muted),
    line: read("--spectrogram-line", FALLBACK_THEME.line),
  };
}

/** Bottom of the log-frequency axis -- below the bottom of a baritone sax /
 *  bassoon in concert pitch, matching transcribe.ts's MIN_HZ. */
export const SPECTROGRAM_MIN_HZ = 55;
/** Top of the axis -- comfortably above a flute or soprano sax's altissimo. */
export const SPECTROGRAM_MAX_HZ = 5000;
/** How much of the canvas width one waterfall fills before the oldest
 *  column scrolls off, in seconds. */
export const SPECTROGRAM_WINDOW_SEC = 20;
/** Fixed left-hand strip reserved for note-name ticks; never scrolled. */
export const SPECTROGRAM_GUTTER_PX = 34;

const FLOOR_DB = -100;
const CEIL_DB = -25;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** 0 at `minHz`, 1 at `maxHz`, logarithmic in between -- an octave takes the
 *  same vertical distance no matter which octave it is. */
export function hzToFraction(hz: number, minHz = SPECTROGRAM_MIN_HZ, maxHz = SPECTROGRAM_MAX_HZ): number {
  const clamped = Math.min(maxHz, Math.max(minHz, hz));
  return Math.log(clamped / minHz) / Math.log(maxHz / minHz);
}

/** Pixel row for `hz` within a `height`-tall plot area: high frequencies
 *  near the top (y=0), low frequencies near the bottom, matching how the
 *  live spectrum view already lays out its axis. */
export function yForHz(hz: number, height: number, minHz = SPECTROGRAM_MIN_HZ, maxHz = SPECTROGRAM_MAX_HZ): number {
  return height - hzToFraction(hz, minHz, maxHz) * height;
}

/** Inverse of yForHz -- which frequency a given pixel row represents, so the
 *  painter can sample one spectrum bin per row when filling a column. */
export function hzForY(y: number, height: number, minHz = SPECTROGRAM_MIN_HZ, maxHz = SPECTROGRAM_MAX_HZ): number {
  const fraction = clamp01(1 - y / Math.max(height, 1));
  return minHz * (maxHz / minHz) ** fraction;
}

export type SpectrogramTick = { midi: number; hz: number; label: string };

/** One tick per octave (every C), which is enough to read the axis without
 *  crowding a narrow canvas the way a tick per semitone would. */
export function noteTicks(minHz = SPECTROGRAM_MIN_HZ, maxHz = SPECTROGRAM_MAX_HZ): SpectrogramTick[] {
  if (!(maxHz > minHz) || minHz <= 0) return [];
  const minMidi = Math.ceil(69 + 12 * Math.log2(minHz / 440));
  const maxMidi = Math.floor(69 + 12 * Math.log2(maxHz / 440));
  const ticks: SpectrogramTick[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi += 1) {
    if (((midi % 12) + 12) % 12 !== 0) continue; // C only
    const hz = 440 * 2 ** ((midi - 69) / 12);
    ticks.push({ midi, hz, label: `C${Math.floor(midi / 12) - 1}` });
  }
  return ticks;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [11, 11, 13];
  const value = match[1];
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Magnitude (dB, as getFloatFrequencyData reports it) -> a CSS colour, via a
 * two-stage ramp through the theme's quiet and loud tokens: background up to
 * "quiet", quiet up to "loud". Clamped at both ends so a wildly hot or cold
 * frame never wraps to a nonsense colour.
 */
export function magnitudeColor(db: number, theme: SpectrogramTheme, floorDb = FLOOR_DB, ceilDb = CEIL_DB): string {
  const t = clamp01((db - floorDb) / (ceilDb - floorDb));
  const bg = hexToRgb(theme.bg);
  const quiet = hexToRgb(theme.quiet);
  const loud = hexToRgb(theme.loud);
  const [r, g, b] = t < 0.5 ? mixRgb(bg, quiet, t / 0.5) : mixRgb(quiet, loud, (t - 0.5) / 0.5);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * How often a new column may be painted. A column only needs to advance a
 * handful of times a second to fill a SPECTROGRAM_WINDOW_SEC-wide canvas --
 * far less often than the ~60fps the rAF loop actually runs at -- so most
 * calls into maybeDrawColumn are a no-op. Under prefers-reduced-motion the
 * interval widens further: the waterfall still updates (pausing it entirely
 * would mean it never shows anything), it just scrolls more slowly.
 */
export function columnIntervalMs(reducedMotion: boolean): number {
  return reducedMotion ? 250 : 1000 / 24;
}

/**
 * Scrolls and paints the waterfall in place on whatever 2D context the
 * caller gives it (AnalysisView's existing canvas), reusing that canvas as
 * its own back buffer rather than allocating an offscreen one.
 */
export class SpectrogramPainter {
  private theme: SpectrogramTheme;
  private lastColumnAt = 0;

  constructor(theme: SpectrogramTheme) {
    this.theme = theme;
  }

  setTheme(theme: SpectrogramTheme) {
    this.theme = theme;
  }

  /** Fills the whole plot with the background colour and redraws the fixed
   *  gutter. Call once when entering spectrogram mode and again after any
   *  resize, since resizing a <canvas> discards its pixels. */
  reset(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, width, height);
    this.lastColumnAt = 0;
    this.drawGutter(ctx, height);
  }

  /** Advances the waterfall by exactly one column if `intervalMs` has
   *  elapsed since the last one, sampling one spectrum bin per pixel row.
   *  Returns whether it actually drew. */
  maybeDrawColumn(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    freqData: Float32Array,
    binHz: number,
    nowMs: number,
    intervalMs: number,
  ): boolean {
    if (nowMs - this.lastColumnAt < intervalMs) return false;
    this.lastColumnAt = nowMs;
    const plotWidth = Math.floor(width) - SPECTROGRAM_GUTTER_PX;
    if (plotWidth < 2 || binHz <= 0) return false;
    ctx.drawImage(
      ctx.canvas,
      SPECTROGRAM_GUTTER_PX + 1, 0, plotWidth - 1, height,
      SPECTROGRAM_GUTTER_PX, 0, plotWidth - 1, height,
    );
    const rightColumn = SPECTROGRAM_GUTTER_PX + plotWidth - 1;
    for (let y = 0; y < height; y += 1) {
      const hz = hzForY(y, height);
      const bin = Math.max(0, Math.min(freqData.length - 1, Math.round(hz / binHz)));
      ctx.fillStyle = magnitudeColor(freqData[bin], this.theme);
      ctx.fillRect(rightColumn, y, 1, 1);
    }
    this.drawGutter(ctx, height);
    return true;
  }

  /** Redraws the fixed note-name gutter. Called after every column so the
   *  self-copy `drawImage` scroll (which covers the whole canvas including
   *  the gutter region conceptually, though the scroll itself is clipped to
   *  the plot area above) never leaves stale tick text behind. */
  private drawGutter(ctx: CanvasRenderingContext2D, height: number) {
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, SPECTROGRAM_GUTTER_PX, height);
    ctx.font = "10px monospace";
    ctx.textBaseline = "middle";
    for (const tick of noteTicks()) {
      const y = yForHz(tick.hz, height);
      if (y < 4 || y > height - 4) continue;
      ctx.strokeStyle = this.theme.line;
      ctx.beginPath();
      ctx.moveTo(SPECTROGRAM_GUTTER_PX - 6, y);
      ctx.lineTo(SPECTROGRAM_GUTTER_PX, y);
      ctx.stroke();
      ctx.fillStyle = this.theme.muted;
      ctx.fillText(tick.label, 2, y);
    }
  }
}
