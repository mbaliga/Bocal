import type { InstrumentId } from "../instruments";

/**
 * Shared shape for every 2D fingering chart in this directory. See the
 * per-instrument files (flute.ts, clarinet.ts, oboe.ts, bassoon.ts) for the
 * data itself and the sources each was checked against, and index.ts for how
 * they are wired to instruments.
 */

export type ChartKeyHand = "L" | "R" | "thumb";
export type ChartKeyShape = "round" | "pill" | "lever";

/**
 * One physical touch-piece in the key layout, positioned in a normalised
 * 0-100 coordinate space (x: left to right, y: mouthpiece/reed at the top to
 * bell/foot at the bottom) so the diagram reads top-to-bottom the way a
 * method-book chart does, at any render size.
 */
export type ChartKey = {
  id: string;
  label: string;
  hand: ChartKeyHand;
  x: number;
  y: number;
  /** Radius in the same 0-100 space. Defaults to 5.5 for "round". */
  r?: number;
  shape?: ChartKeyShape;
};

export type ChartAlternate = {
  label: string;
  keys: string[];
  /** Keys shown half-filled for this alternate (see `Fingering.halfKeys`). */
  halfKeys?: string[];
  hint: string;
  useWhen: string;
};

export type Fingering = {
  id: string;
  /** Written MIDI note number (the pitch the player reads, not concert pitch). */
  writtenMidi: number;
  /** Key ids pressed/closed for this note. */
  keys: string[];
  /**
   * Key ids that are only half-covered (the oboe's and bassoon's LH1
   * half-hole). Rendered half-filled; never also listed in `keys`.
   */
  halfKeys?: string[];
  hint: string;
  /** Only ever used for a genuinely universal alternate -- see the file comments. */
  alternates?: ChartAlternate[];
};

export type FingeringChart = {
  /**
   * The instrument this key layout and fingering data was authored for. A
   * chart can be reused by another instrument that shares the same key
   * system (the cor anglais uses the oboe chart) -- see index.ts.
   */
  instrumentId: InstrumentId;
  keys: ChartKey[];
  fingerings: Fingering[];
  /**
   * Shown as a badge in the chart UI and read out in a truth card. Every
   * chart in this directory carries the same honest disclosure: this is
   * method-book consensus, cross-checked against two independent published
   * fingering references, but no teacher has reviewed it note by note.
   */
  review: string;
};
