import type { InstrumentId } from "../instruments";

/**
 * Hole-and-breath charts for the two harmonicas, generated from the standard
 * layouts rather than typed out note by note. Nothing here is a fingering: a
 * harmonica has no keys, so a note is a hole, a direction of breath, how far
 * the player bends it, and (chromatic only) whether the slide is pushed in.
 *
 * Standard diatonic layout (Richter tuning, key of C), the table the charts
 * below are checked against in tests/harmonica.test.mjs:
 *
 *   hole    1  2  3  4  5  6  7  8  9  10
 *   blow    C  E  G  C  E  G  C  E  G  C      (C4 E4 G4 C5 E5 G5 C6 E6 G6 C7)
 *   draw    D  G  B  D  F  A  B  D  F  A      (D4 G4 B4 D5 F5 A5 B5 D6 F6 A6)
 *
 * Published reference, fetched 2026-10-12: Wikipedia, "Richter-tuned
 * harmonica" (en.wikipedia.org/wiki/Richter-tuned_harmonica), whose
 * per-hole table gives exactly the blow and draw rows above for holes 1-10
 * (blow C E G C E G C E G C, draw D G B D F A B D F A). The 1-3-5 blow
 * pattern (a C major triad repeating up the harp) and the 2-4-5-7 draw
 * pattern (D G B | D F A B | D F A) are that table's own shape, not
 * something derived here. The same page does not list bend or overblow
 * notes per hole, so those are computed as described below.
 *
 * What is computed, and how:
 *   - Draw bends (holes 1-6): where the draw note is higher than the blow
 *     note, a draw bend can lower it by single semitones down to one
 *     semitone above the blow note, so a hole has (draw - blow - 1) bends.
 *   - Blow bends (holes 7-10): where the blow note is higher than the draw
 *     note, the same arithmetic applies in the other direction.
 *   - Overblows (holes 1, 4, 5, 6) are charted one semitone above the hole's
 *     draw note and overdraws (holes 7, 9, 10) one semitone above its blow
 *     note. They are marked `advanced` and `unverified`: the sounding pitch
 *     of an overblow or overdraw depends heavily on the harp's setup and the
 *     player, and no published reference was cross-checked for them.
 *   - Bend availability varies by harp and by player. The chart lists every
 *     bend the interval allows, not every bend a given harp will give.
 *
 * Key shift: the layout above is the key of C. Every other key moves every
 * note by the key's semitone offset. The offsets follow the usual pitching
 * of the standard (not Low or High) range, where G, A♭, A, B♭ and B sit
 * below middle C and C, D♭, D, E♭, E, F and F♯ at or above it.
 *
 * Chromatic (12-hole, solo tuning): each group of four holes is blow
 * C E G C and draw D F A B, three octaves from C4, and pushing the slide in
 * raises every note a semitone. Wikipedia, "Harmonica" (en.wikipedia.org/
 * wiki/Harmonica), gives the 12-hole chromatic range as C4 to C♯7 with hole
 * 12 slide-out blow C, slide-in blow C♯ and slide-out draw B, which is what
 * this layout produces. D7 is not on a hole, so the tuner window reaches D7
 * with a little to spare for a sharp top note rather than claiming a hole
 * for it. Chromatic bends are not charted.
 *
 * Every chart carries the badge text below: computed, not teacher-reviewed.
 */

export type HarmonicaBreath = "blow" | "draw";
export type HarmonicaBend = 0 | 1 | 2 | 3;

export type HarmonicaNote = {
  id: string;
  /** Sounding (concert) MIDI note. Harmonicas do not transpose. */
  midi: number;
  hole: number;
  breath: HarmonicaBreath;
  /** Semitones the note is bent down from the plain blow or draw note, 0 to 3. */
  bend: HarmonicaBend;
  /** Chromatic only: the slide is pushed in. */
  slide?: boolean;
  /** Overblows and overdraws. */
  advanced?: boolean;
  /** No published reference was cross-checked for this note. Set on every advanced note. */
  unverified?: boolean;
  technique?: "overblow" | "overdraw";
};

export type HarmonicaChartData = {
  instrumentId: InstrumentId;
  kind: "diatonic" | "chromatic";
  /** Diatonic only. */
  keyId?: HarmonicaKeyId;
  holes: number;
  /** Ascending by pitch; see `compareNotes`. */
  notes: HarmonicaNote[];
  /** The badge text. */
  review: string;
  /** The line shown under the badge. */
  caveat: string;
};

export const HARMONICA_REVIEW = "Standard Richter layout, computed, not teacher-reviewed.";
export const HARMONICA_CHROMATIC_REVIEW = "Standard 12-hole solo-tuned layout, computed, not teacher-reviewed.";
export const HARMONICA_CAVEAT = "Bend availability varies by harp and player.";
export const HARMONICA_CHROMATIC_CAVEAT = "Bends are not charted for the chromatic. Bend availability varies by harp and player.";

export const HARMONICA_KEYS = [
  { id: "g", label: "G", offset: -5 },
  { id: "ab", label: "A♭", offset: -4 },
  { id: "a", label: "A", offset: -3 },
  { id: "bb", label: "B♭", offset: -2 },
  { id: "b", label: "B", offset: -1 },
  { id: "c", label: "C", offset: 0 },
  { id: "db", label: "D♭", offset: 1 },
  { id: "d", label: "D", offset: 2 },
  { id: "eb", label: "E♭", offset: 3 },
  { id: "e", label: "E", offset: 4 },
  { id: "f", label: "F", offset: 5 },
  { id: "fs", label: "F♯", offset: 6 },
] as const;

export type HarmonicaKeyId = (typeof HARMONICA_KEYS)[number]["id"];
export const DEFAULT_HARMONICA_KEY: HarmonicaKeyId = "c";

/** Reads a saved key id back, falling back to C for anything that is not one of the twelve. */
export function sanitiseHarmonicaKey(raw: unknown): HarmonicaKeyId {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  for (const key of HARMONICA_KEYS) if (key.id === value) return key.id;
  return DEFAULT_HARMONICA_KEY;
}

export function harmonicaKeyOffset(keyId: HarmonicaKeyId): number {
  for (const key of HARMONICA_KEYS) if (key.id === keyId) return key.offset;
  return 0;
}

export function harmonicaKeyLabel(keyId: HarmonicaKeyId): string {
  for (const key of HARMONICA_KEYS) if (key.id === keyId) return key.label;
  return "C";
}

const C4 = 60;
/** Semitones above C4 of each hole's blow note on a C Richter harp: C E G, then up an octave, three times over and one more. */
const RICHTER_BLOW = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36];
/** Semitones above C4 of each hole's draw note on a C Richter harp: D G B | D F A B | D F A. */
const RICHTER_DRAW = [2, 7, 11, 14, 17, 21, 23, 26, 29, 33];
const OVERBLOW_HOLES = [1, 4, 5, 6];
const OVERDRAW_HOLES = [7, 9, 10];

const BREATH_SHORT: Record<HarmonicaBreath, string> = { blow: "b", draw: "d" };

function compareNotes(a: HarmonicaNote, b: HarmonicaNote) {
  if (a.midi !== b.midi) return a.midi - b.midi;
  if (Boolean(a.advanced) !== Boolean(b.advanced)) return a.advanced ? 1 : -1;
  if (a.bend !== b.bend) return a.bend - b.bend;
  if (a.hole !== b.hole) return a.hole - b.hole;
  if (Boolean(a.slide) !== Boolean(b.slide)) return a.slide ? 1 : -1;
  return a.breath === b.breath ? 0 : a.breath === "blow" ? -1 : 1;
}

function diatonicNotes(offset: number): HarmonicaNote[] {
  const notes: HarmonicaNote[] = [];
  for (let index = 0; index < RICHTER_BLOW.length; index += 1) {
    const hole = index + 1;
    const blow = C4 + offset + RICHTER_BLOW[index];
    const draw = C4 + offset + RICHTER_DRAW[index];
    notes.push({ id: `${hole}b0`, midi: blow, hole, breath: "blow", bend: 0 });
    notes.push({ id: `${hole}d0`, midi: draw, hole, breath: "draw", bend: 0 });
    if (draw > blow) {
      for (let depth = 1; depth <= draw - blow - 1; depth += 1) {
        notes.push({ id: `${hole}d${depth}`, midi: draw - depth, hole, breath: "draw", bend: depth as HarmonicaBend });
      }
    } else {
      for (let depth = 1; depth <= blow - draw - 1; depth += 1) {
        notes.push({ id: `${hole}b${depth}`, midi: blow - depth, hole, breath: "blow", bend: depth as HarmonicaBend });
      }
    }
    if (OVERBLOW_HOLES.indexOf(hole) >= 0) {
      notes.push({ id: `${hole}ob`, midi: draw + 1, hole, breath: "blow", bend: 0, advanced: true, unverified: true, technique: "overblow" });
    }
    if (OVERDRAW_HOLES.indexOf(hole) >= 0) {
      notes.push({ id: `${hole}od`, midi: blow + 1, hole, breath: "draw", bend: 0, advanced: true, unverified: true, technique: "overdraw" });
    }
  }
  return notes.sort(compareNotes);
}

export function buildDiatonicHarmonicaChart(keyId: HarmonicaKeyId = DEFAULT_HARMONICA_KEY): HarmonicaChartData {
  return {
    instrumentId: "diatonic-harmonica",
    kind: "diatonic",
    keyId,
    holes: 10,
    notes: diatonicNotes(harmonicaKeyOffset(keyId)),
    review: HARMONICA_REVIEW,
    caveat: HARMONICA_CAVEAT,
  };
}

/** Within each group of four holes: blow C E G C, draw D F A B (semitones above the group's C). */
const CHROMATIC_BLOW = [0, 4, 7, 12];
const CHROMATIC_DRAW = [2, 5, 9, 11];

function chromaticNotes(): HarmonicaNote[] {
  const notes: HarmonicaNote[] = [];
  for (let hole = 1; hole <= 12; hole += 1) {
    const group = Math.floor((hole - 1) / 4);
    const position = (hole - 1) % 4;
    const base = C4 + 12 * group;
    for (const breath of ["blow", "draw"] as const) {
      const plain = base + (breath === "blow" ? CHROMATIC_BLOW[position] : CHROMATIC_DRAW[position]);
      notes.push({ id: `${hole}${BREATH_SHORT[breath]}`, midi: plain, hole, breath, bend: 0 });
      notes.push({ id: `${hole}${BREATH_SHORT[breath]}s`, midi: plain + 1, hole, breath, bend: 0, slide: true });
    }
  }
  return notes.sort(compareNotes);
}

export const CHROMATIC_HARMONICA_CHART: HarmonicaChartData = {
  instrumentId: "chromatic-harmonica",
  kind: "chromatic",
  holes: 12,
  notes: chromaticNotes(),
  review: HARMONICA_CHROMATIC_REVIEW,
  caveat: HARMONICA_CHROMATIC_CAVEAT,
};

export const DIATONIC_HARMONICA_CHART: HarmonicaChartData = buildDiatonicHarmonicaChart(DEFAULT_HARMONICA_KEY);

function hzOf(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * The tracker window for a harmonica, with a quarter-tone of margin below the
 * lowest and above the highest plain note. The diatonic's window follows its
 * key (C4 to C7, shifted by the key's offset); the chromatic's is C4 to D7.
 */
export function harmonicaRangeHz(instrumentId: InstrumentId, keyId: HarmonicaKeyId = DEFAULT_HARMONICA_KEY): { minHz: number; maxHz: number } {
  const lowMidi = instrumentId === "chromatic-harmonica" ? C4 : C4 + harmonicaKeyOffset(keyId);
  const highMidi = instrumentId === "chromatic-harmonica" ? C4 + 38 : C4 + harmonicaKeyOffset(keyId) + 36;
  return { minHz: Math.floor(hzOf(lowMidi - 0.5)), maxHz: Math.ceil(hzOf(highMidi + 0.5)) };
}

/** How many bends each hole can make, for holes 1..holes (diatonic: 1,2,3,1,0,1,0,1,1,2 on every key). */
export function bendCountsByHole(chart: HarmonicaChartData): number[] {
  const counts: number[] = [];
  for (let hole = 1; hole <= chart.holes; hole += 1) {
    let most = 0;
    for (const note of chart.notes) if (note.hole === hole && note.bend > most) most = note.bend;
    counts.push(most);
  }
  return counts;
}

/** Every way to play a pitch, easiest first (plain notes before bends before overblows). */
export function routesForMidi(chart: HarmonicaChartData, midi: number, includeAdvanced = true): HarmonicaNote[] {
  return chart.notes.filter((note) => note.midi === midi && (includeAdvanced || !note.advanced));
}

/** The distinct pitches a player can reach, ascending. */
export function playableMidis(chart: HarmonicaChartData, includeAdvanced = true): number[] {
  const seen: number[] = [];
  for (const note of chart.notes) {
    if (!includeAdvanced && note.advanced) continue;
    if (seen.length === 0 || seen[seen.length - 1] !== note.midi) seen.push(note.midi);
  }
  return seen;
}

const BEND_NAMES = ["", "a half step", "a whole step", "a step and a half"];

export function bendName(bend: HarmonicaBend): string {
  return BEND_NAMES[bend];
}

/** "Hole 3, draw, bent down a whole step", "Hole 4, blow, slide in", "Hole 6, blow, overblow (unverified)". */
export function describeHarmonicaNote(note: HarmonicaNote): string {
  const parts = [`Hole ${note.hole}`, note.breath];
  if (note.bend > 0) parts.push(`bent down ${bendName(note.bend)}`);
  if (note.technique) parts.push(note.technique);
  if (note.slide) parts.push("slide in");
  if (note.unverified) parts.push("unverified");
  return parts.join(", ");
}
