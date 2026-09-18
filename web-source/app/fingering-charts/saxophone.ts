import {
  SAXOPHONE_FINGERINGS,
  type Fingering as SaxFingering,
  type FingeringOption as SaxFingeringOption,
  type SaxKeyId,
} from "../sax-data";
import type { ChartKey, Fingering, FingeringChart } from "./types";

/**
 * The saxophone's 2D fingering chart, drawn beneath the 3D stage in
 * SaxophoneLab the way the oboe chart sits under OboeLab. This file has no
 * fingering data of its own -- `sax-data.ts` (`SAX_KEYS`, `SAXOPHONE_FINGERINGS`)
 * is the single source of truth the whole sax lab already uses for the 3D
 * key glow, the trainer and the setup explorer, so this is only a generator:
 * a hand-authored 2D key layout (the 3D model's `position` values are real
 * mesh coordinates, not a top-to-bottom diagram, so they cannot be reused
 * directly) plus a mapper from `SAXOPHONE_FINGERINGS`' shape to the shared
 * `FingeringChart` shape every other instrument's chart already uses.
 *
 * Sourcing lives in sax-data.ts itself, not here: every fingering below is
 * exactly what `SAXOPHONE_FINGERINGS` already carries, so it is confirmed to
 * whatever standard that file documents for that note (the Woodwind
 * Fingering Guide plus a second source for the standard range; the
 * Woodwind Fingering Guide's altissimo aggregator plus method-literature
 * summaries, badged "Unverified", for G6-C7). See the block comments above
 * `SAXOPHONE_FINGERINGS` and its altissimo section in sax-data.ts.
 *
 * The key layout below draws every touch-piece in `SAX_KEYS` (24, at this
 * chart's own limit for legibility): the octave lever and baritone's low A
 * near the top by the left thumb, the front F touch and bis B♭ pearl beside
 * the left hand's three main pearls, the three left-palm keys (D/E♭/F)
 * further up, the left-pinky cluster (G♯/low C♯/low B/low B♭) below the
 * left hand, the right hand's three main pearls and its four side keys
 * (E/C/B♭/alternate-F♯, plus the separate keyed high F♯), and the
 * right-pinky cluster (low C/low E♭) below the right hand.
 */

const keys: ChartKey[] = [
  { id: "octave", label: "Octave", hand: "thumb", x: 26, y: 6, shape: "lever", r: 4.2 },
  { id: "lowA", label: "Low A (bari only)", hand: "thumb", x: 13, y: 8, shape: "lever", r: 3.6 },

  { id: "palmD", label: "D", hand: "L", x: 70, y: 12, shape: "lever", r: 3.6 },
  { id: "palmEb", label: "E♭", hand: "L", x: 74, y: 19, shape: "lever", r: 3.6 },
  { id: "palmF", label: "F", hand: "L", x: 78, y: 26, shape: "lever", r: 3.6 },

  { id: "frontF", label: "Front F", hand: "L", x: 36, y: 18, shape: "lever", r: 3.8 },
  { id: "lh1", label: "1 (B)", hand: "L", x: 50, y: 22 },
  { id: "bis", label: "Bis B♭", hand: "L", x: 61, y: 22, r: 3.2 },
  { id: "lh2", label: "2 (A)", hand: "L", x: 50, y: 31 },
  { id: "lh3", label: "3 (G)", hand: "L", x: 50, y: 40 },

  { id: "gsharp", label: "G♯", hand: "L", x: 31, y: 44, shape: "lever", r: 3.6 },
  { id: "lowCsharp", label: "Low C♯", hand: "L", x: 29, y: 50, shape: "lever", r: 3.6 },
  { id: "lowB", label: "Low B", hand: "L", x: 27, y: 56, shape: "lever", r: 3.6 },
  { id: "lowBb", label: "Low B♭", hand: "L", x: 25, y: 62, shape: "lever", r: 3.6 },

  { id: "rh1", label: "1 (F)", hand: "R", x: 50, y: 53 },
  { id: "rh2", label: "2 (E)", hand: "R", x: 50, y: 62 },
  { id: "rh3", label: "3 (D)", hand: "R", x: 50, y: 71 },

  { id: "sideE", label: "Side E", hand: "R", x: 68, y: 50, r: 3.2 },
  { id: "sideC", label: "Side C", hand: "R", x: 68, y: 56, r: 3.2 },
  { id: "sideBb", label: "Side B♭", hand: "R", x: 68, y: 62, r: 3.2 },
  { id: "altFsharp", label: "Alt. F♯", hand: "R", x: 68, y: 68, r: 3.2 },
  { id: "highFsharp", label: "High F♯", hand: "R", x: 68, y: 74, r: 3.2 },

  { id: "lowC", label: "Low C", hand: "R", x: 61, y: 80, shape: "lever", r: 3.6 },
  { id: "lowEb", label: "Low E♭", hand: "R", x: 61, y: 86, shape: "lever", r: 3.6 },
];

function toBadge(review: SaxFingering["review"] | SaxFingeringOption["review"]): string | undefined {
  return review === "unverified" ? "Unverified" : undefined;
}

function toAlternate(option: SaxFingeringOption) {
  return {
    label: option.label,
    keys: option.keys as string[],
    hint: option.hint,
    useWhen: option.useWhen,
    badge: toBadge(option.review),
  };
}

function toFingering(note: SaxFingering): Fingering {
  return {
    id: note.id,
    writtenMidi: note.midi,
    keys: note.keys as SaxKeyId[] as string[],
    hint: note.hint,
    alternates: note.alternates?.map(toAlternate),
    badge: toBadge(note.review) ?? (note.level === "Altissimo" ? "Unverified" : undefined),
  };
}

// Baritone's low A3 (instrument: ["bari-sax"]) is deliberately left out of
// this shared chart. FingeringChart has no per-instrument note filtering --
// every other chart in this directory applies to exactly one instrument
// (or, for cor anglais, one borrowed chart trimmed by range, never by
// caller) -- so mixing in a baritone-only note here would let a soprano,
// alto or tenor player step onto a fingering that does not exist on their
// horn. SaxophoneLab.tsx shows a3 in its own note browser (which already
// filters `SAXOPHONE_FINGERINGS` by instrument) instead.
const fingerings: Fingering[] = SAXOPHONE_FINGERINGS
  .filter((note) => !note.instrument)
  .map(toFingering);

export const SAXOPHONE_CHART: FingeringChart = {
  instrumentId: "alto-sax",
  keys,
  fingerings,
  review: "method-book consensus, not yet teacher-reviewed",
};
