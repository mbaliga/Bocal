// Canvas painting for the play-along drill's small result plot. Like
// vocal-graph-canvas.ts it talks to a 2D context and to computed CSS custom
// properties, so it is not unit tested; the numbers it places things with come
// from vocal-graph.ts (midiToY) and call-response.ts, which are.
//
// The plot is a row of note slots, one per note of the phrase, wide in
// proportion to the note's beats. Each slot holds a band: the pitch the note
// should reach, as wide as the chosen threshold. After an attempt, the notes
// Bocal heard are drawn inside the slots they were matched to. This is a plot
// of pitch and order. It is not a time axis, and it says so beside the plot:
// when a note was sung is never judged.

import { fullNoteLabel, type NotationSystem } from "./notation";
import type { PitchHistorySample } from "./pitch-history";
import type { CallPhrase, RoundResult } from "./call-response";
import { midiToY, type PitchView, type PlotBox } from "./vocal-graph";
import { prepareCanvas } from "./vocal-graph-canvas";

export type CallPlotTheme = {
  ink: string;
  muted: string;
  grid: string;
  band: string;
  hit: string;
  miss: string;
  trace: string;
};

const FALLBACK_THEME: CallPlotTheme = {
  ink: "#f5f3eb",
  muted: "#bdb9ae",
  grid: "#2c2e36",
  band: "#8e7bff",
  hit: "#08fed5",
  miss: "#f2b84b",
  trace: "#f5f3eb",
};

/** Reads the plot's scoped colour tokens (`--cr-*`, defined on `.call-response-plot` in styles/call-response.css). */
export function readCallPlotTheme(element: Element): CallPlotTheme {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--cr-ink", FALLBACK_THEME.ink),
    muted: read("--cr-muted", FALLBACK_THEME.muted),
    grid: read("--cr-grid", FALLBACK_THEME.grid),
    band: read("--cr-band", FALLBACK_THEME.band),
    hit: read("--cr-hit", FALLBACK_THEME.hit),
    miss: read("--cr-miss", FALLBACK_THEME.miss),
    trace: read("--cr-trace", FALLBACK_THEME.trace),
  };
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const hex = match[1];
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${alpha})`;
}

export type CallPlotInput = {
  /** The phrase being drilled, in concert pitch. */
  phrase: CallPhrase;
  /** Semitones to add to a concert note to show it in written pitch. */
  writtenOffset: number;
  notation: NotationSystem;
  saTonic: number;
  /** Half-width of each note's band, in cents. */
  bandCents: number;
  /** The scored attempt, or null before one exists. */
  result: RoundResult | null;
  /** The frames the result was scored from (concert pitch). */
  frames: PitchHistorySample[];
  /** The player's pitch right now (fractional concert MIDI) while listening, else null. */
  live: number | null;
  /** The note sounding right now while the phrase plays, else null. */
  playingIndex: number | null;
  theme: CallPlotTheme;
};

const GUTTER_LEFT = 46;
const GUTTER_RIGHT = 10;
const GUTTER_TOP = 22;
const GUTTER_BOTTOM = 8;
const SLOT_GAP = 6;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function callPlotBox(cssWidth: number, cssHeight: number): PlotBox {
  return {
    left: GUTTER_LEFT,
    top: GUTTER_TOP,
    width: Math.max(1, cssWidth - GUTTER_LEFT - GUTTER_RIGHT),
    height: Math.max(1, cssHeight - GUTTER_TOP - GUTTER_BOTTOM),
  };
}

/** The pitch axis the plot uses: the phrase's own notes with room above and below, never narrower than seven semitones. */
export function callPlotView(phrase: CallPhrase): PitchView {
  const midis = phrase.notes.map((note) => note.midi);
  if (midis.length === 0) return { lo: 55, hi: 70 };
  const lowest = Math.min(...midis);
  const highest = Math.max(...midis);
  const span = Math.max(7, highest - lowest + 3);
  const middle = (lowest + highest) / 2;
  return { lo: middle - span / 2, hi: middle + span / 2 };
}

export function drawCallPlot(canvas: HTMLCanvasElement, input: CallPlotInput): void {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height } = prepared;
  const { phrase, theme, result } = input;
  const box = callPlotBox(width, height);
  const view = callPlotView(phrase);
  const yOf = (midi: number) => midiToY(midi, view, box);
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const pxPerSemitone = box.height / (view.hi - view.lo);
  const totalBeats = phrase.notes.reduce((sum, note) => sum + note.beats, 0) || 1;

  // A guide line and a written-pitch name for each distinct note of the phrase.
  ctx.font = `11px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  const seen = new Set<number>();
  for (const note of phrase.notes) {
    if (seen.has(note.midi)) continue;
    seen.add(note.midi);
    const y = Math.round(yOf(note.midi)) + 0.5;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(fullNoteLabel(note.midi + input.writtenOffset, input.notation, input.saTonic), box.left - 6, y);
  }

  // One slot per note, wide in proportion to its beats.
  let cursor = box.left;
  const halfBand = Math.max(3.5, (input.bandCents / 100) * pxPerSemitone);
  phrase.notes.forEach((note, index) => {
    const slotWidth = (box.width * note.beats) / totalBeats;
    const x0 = cursor + SLOT_GAP / 2;
    const x1 = cursor + slotWidth - SLOT_GAP / 2;
    cursor += slotWidth;
    const verdict = result ? result.notes[index].verdict : null;
    const colour = verdict === "matched" ? theme.hit : verdict ? theme.miss : theme.band;
    const playing = input.playingIndex === index;
    const centre = yOf(note.midi);

    ctx.fillStyle = withAlpha(colour, playing ? 0.5 : verdict ? 0.26 : 0.22);
    ctx.fillRect(x0, centre - halfBand, x1 - x0, halfBand * 2);
    ctx.strokeStyle = withAlpha(colour, 0.9);
    ctx.lineWidth = playing ? 2 : 1;
    ctx.strokeRect(x0 + 0.5, centre - halfBand + 0.5, x1 - x0 - 1, halfBand * 2 - 1);
    ctx.strokeStyle = withAlpha(colour, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(centre) + 0.5);
    ctx.lineTo(x1, Math.round(centre) + 0.5);
    ctx.stroke();

    // The tick, cross or octave mark above the slot.
    if (verdict) {
      const cx = (x0 + x1) / 2;
      const cy = box.top - 11;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (verdict === "matched") {
        ctx.moveTo(cx - 5, cy);
        ctx.lineTo(cx - 1.5, cy + 4);
        ctx.lineTo(cx + 5.5, cy - 4);
        ctx.stroke();
      } else if (verdict === "missed") {
        ctx.moveTo(cx - 4.5, cy - 4.5);
        ctx.lineTo(cx + 4.5, cy + 4.5);
        ctx.moveTo(cx + 4.5, cy - 4.5);
        ctx.lineTo(cx - 4.5, cy + 4.5);
        ctx.stroke();
      } else {
        ctx.font = `700 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText("8va", cx, cy);
      }
    }

    // What was heard for this note, drawn inside its own slot (order, not time).
    if (result && verdict === "matched") {
      const heardIndex = result.notes[index].heardIndex;
      const heard = heardIndex === null ? null : result.heard[heardIndex];
      if (heard) {
        const points: { pitch: number }[] = [];
        for (let at = heard.startIndex; at <= heard.endIndex; at += 1) {
          const sample = input.frames[at];
          if (sample && sample.midi !== null && sample.cents !== null) points.push({ pitch: sample.midi + sample.cents / 100 });
        }
        if (points.length >= 2) {
          ctx.strokeStyle = theme.trace;
          ctx.lineWidth = 2;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          const inner0 = x0 + 4;
          const inner1 = x1 - 4;
          points.forEach((point, pointIndex) => {
            const x = inner0 + ((inner1 - inner0) * pointIndex) / (points.length - 1);
            const y = Math.min(bottom, Math.max(box.top, yOf(point.pitch)));
            if (pointIndex === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
      }
    }
  });

  // The player's pitch right now, while listening.
  if (input.live !== null) {
    const y = Math.min(bottom, Math.max(box.top, yOf(input.live)));
    ctx.strokeStyle = withAlpha(theme.trace, 0.7);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.trace;
    ctx.beginPath();
    ctx.arc(right - 6, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
