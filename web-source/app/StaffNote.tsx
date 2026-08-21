"use client";

import { useId } from "react";
import { octaveOf, spellingFor } from "./notation";

/**
 * A single note drawn on a five-line stave.
 *
 * Everything here is hand-authored geometry rather than a music font. Neither
 * the design system nor the app ships Bravura or any other SMuFL face, and
 * relying on the Unicode musical symbols means relying on whatever the device's
 * fallback font happens to have -- which on Android WebView is a coin flip.
 * Paths render identically everywhere and scale cleanly, so the clefs, the
 * accidentals and the notehead are all drawn.
 *
 * The clefs are monoline strokes rather than filled outlines. A filled outline
 * needs the pen-angle thickness modulation of an engraved face to look right;
 * a clean single-weight stroke is an honest style of its own and matches the
 * rest of the app's line work.
 */

export type Clef = "treble" | "bass";

/** Staff line spacing. Lines sit at y = 0, 10, 20, 30, 40. */
const S = 10;

/**
 * Diatonic index of each clef's bottom line: E4 for treble, G2 for bass.
 * Diatonic index counts letter-steps, so an octave is 7 and one staff step
 * (half a line spacing) is 1.
 */
const BOTTOM_LINE: Record<Clef, number> = { treble: 30, bass: 18 };

// Drawn from the bottom tail terminal, up the stem, round the top curl, down
// into the big loop and spiralling in to the terminal on the G line -- the
// order the stroke is actually made by hand.
const TREBLE_CLEF =
  "M -7 54 C -3 58, 3 57, 4 51 C 5 44, 2 38, 0 30 " +
  "C -2 22, 1 12, 3 4 C 4 -3, 3 -10, 8 -13 " +
  "C 13 -16, 15 -8, 11 -2 C 7 5, -1 12, -6 19 " +
  "C -12 26, -13 36, -7 42 C -1 48, 8 46, 10 39 " +
  "C 12 32, 6 26, 1 29 C -3 31, -2 35, 2 35";

// The F clef: a comma whose head sits on the F line, sweeping down and left.
const BASS_CLEF = "M 12 17 C 12 9, 3 6, -2 12 M 12 17 C 12 29, 3 37, -9 43";

function SharpGlyph({ x, y }: { x: number; y: number }) {
  // Two upright strokes and two rising crossbars, the crossbars slanted so the
  // glyph does not disappear into a staff line it happens to land on.
  return (
    <g transform={`translate(${x} ${y})`} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <line x1={-2.6} y1={-8} x2={-2.6} y2={7} />
      <line x1={2.6} y1={-7} x2={2.6} y2={8} />
      <line x1={-5.4} y1={-1.4} x2={5.4} y2={-3.4} strokeWidth={2.4} />
      <line x1={-5.4} y1={3.8} x2={5.4} y2={1.8} strokeWidth={2.4} />
    </g>
  );
}

function FlatGlyph({ x, y }: { x: number; y: number }) {
  // A stem with a bowl hanging off its lower half. The bowl's baseline is the
  // note's own line, which is what makes a flat read as belonging to the note.
  return (
    <g transform={`translate(${x} ${y})`} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round">
      <line x1={-2.6} y1={-11} x2={-2.6} y2={6} />
      <path d="M -2.6 6 C 2 2.5, 5 0.5, 4.4 -2.6 C 3.9 -5.2, 0.4 -5, -2.6 -1.6" strokeLinejoin="round" />
    </g>
  );
}

export default function StaffNote({
  midi,
  clef = "treble",
  height = 132,
  title,
}: {
  midi: number | null;
  clef?: Clef;
  height?: number;
  title?: string;
}) {
  const titleId = useId();
  const bottom = BOTTOM_LINE[clef];
  const noteX = 86;

  // Half-space steps above the bottom line. Line positions are the even values
  // 0, 2, 4, 6, 8; anything outside that range needs ledger lines.
  const step = midi === null ? null : octaveOf(midi) * 7 + spellingFor(midi).letter - bottom;
  const noteY = step === null ? null : 4 * S - (step * S) / 2;
  const accidental = midi === null ? 0 : spellingFor(midi).accidental;

  const ledgers: number[] = [];
  if (step !== null) {
    for (let s = -2; s >= step; s -= 2) ledgers.push(4 * S - (s * S) / 2);
    for (let s = 10; s <= step; s += 2) ledgers.push(4 * S - (s * S) / 2);
  }

  // Stems point down above the middle line and up below it, the usual rule.
  const stemUp = step !== null && step < 4;

  return (
    <svg
      className="staff-note"
      viewBox="-4 -34 128 116"
      height={height}
      role="img"
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={title ? undefined : true}
      preserveAspectRatio="xMidYMid meet"
    >
      {title ? <title id={titleId}>{title}</title> : null}

      <g stroke="currentColor" strokeWidth={1.1} opacity={0.55}>
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={0} y1={i * S} x2={120} y2={i * S} />
        ))}
      </g>

      <g transform={clef === "treble" ? "translate(24 0)" : "translate(20 0)"}>
        <path d={clef === "treble" ? TREBLE_CLEF : BASS_CLEF} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        {clef === "bass" ? (
          <g fill="currentColor">
            <circle cx={18} cy={5} r={1.9} />
            <circle cx={18} cy={15} r={1.9} />
          </g>
        ) : null}
      </g>

      {noteY === null ? (
        <text x={noteX} y={26} textAnchor="middle" fill="currentColor" fontSize={22} opacity={0.4}>
          —
        </text>
      ) : (
        <g>
          <g stroke="currentColor" strokeWidth={1.4}>
            {ledgers.map((y) => (
              <line key={y} x1={noteX - 13} y1={y} x2={noteX + 13} y2={y} />
            ))}
          </g>
          {accidental !== 0
            ? accidental > 0
              ? <SharpGlyph x={noteX - 17} y={noteY} />
              : <FlatGlyph x={noteX - 17} y={noteY} />
            : null}
          <line
            x1={stemUp ? noteX + 7.6 : noteX - 7.6}
            y1={noteY}
            x2={stemUp ? noteX + 7.6 : noteX - 7.6}
            y2={stemUp ? noteY - 33 : noteY + 33}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <ellipse cx={noteX} cy={noteY} rx={7.8} ry={5.6} fill="currentColor" transform={`rotate(-21 ${noteX} ${noteY})`} />
        </g>
      )}
    </svg>
  );
}
