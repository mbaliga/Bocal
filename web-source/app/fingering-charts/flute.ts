import type { Fingering, FingeringChart } from "./types";

/**
 * Standard Boehm flute (closed G#, C-foot -- no low B), method-book
 * fingerings, written pitch (the flute is non-transposing, so written and
 * concert pitch match).
 *
 * Sources cross-checked against each other for every fingering below:
 *   1. The Woodwind Fingering Guide, University of Idaho / Timothy Reichard
 *      (wfg.woodwind.org/flute/fl_bas_1.html, fl_bas_2.html) -- a text-coded
 *      fingering table (thumb / LH123 / RH123 / foot keys) for the first two
 *      octaves, which is what this file is built from directly.
 *   2. Yamaha Corporation's official "Flute Fingerings" chart
 *      (data.yamaha.com/files/download/other_assets/9/320499/flutes_fingerings.pdf),
 *      spot-checked against several notes (low C4, the Bb4 "1-and-1" grip)
 *      to confirm the key layout and touch pattern.
 *
 * Range shipped: C4 to C#6. The brief's target was C4-C7, but the third
 * octave above C#6 is where flute fingerings genuinely diverge between
 * sources (extra vents, model-dependent choices), and the Woodwind
 * Fingering Guide's third-octave chart is icon-only with no parseable text
 * table to check a second source against. Rather than guess, this chart
 * stops at C#6 -- two full octaves plus a step, which covers the range
 * nearly all method-book repertoire actually uses.
 *
 * Left out: the flute's two small chromatic trill keys (drawn in the layout
 * for an honest picture of the instrument, per a real diagram, but pressed
 * by no fingering here -- they are for trills and fast chromatic runs, out
 * of scope for a standard-range chart). The low-B foot joint (brief said
 * skip it).
 *
 * The E♭ (D♯) key: WFG fl_bas_1/2 documents it held down on every note from
 * E4 through C♯6 (both octaves), and it is standard teaching -- without it
 * E4-B4 (and their octave-5 equivalents) are flat and stuffy on a
 * closed-G♯ flute. It is included on every one of those notes below.
 */

const keys: FingeringChart["keys"] = [
  { id: "thumb", label: "Thumb B", hand: "thumb", x: 30, y: 8, shape: "lever" },
  { id: "thumbBb", label: "Thumb B♭", hand: "thumb", x: 18, y: 8, shape: "lever", r: 4 },
  { id: "lh1", label: "1", hand: "L", x: 50, y: 16 },
  { id: "lh2", label: "2", hand: "L", x: 50, y: 25 },
  { id: "lh3", label: "3", hand: "L", x: 50, y: 34 },
  { id: "trill1", label: "D trill", hand: "R", x: 63, y: 55.5, r: 3.4 },
  { id: "trill2", label: "D♯ trill", hand: "R", x: 63, y: 64.5, r: 3.4 },
  { id: "gsharp", label: "G♯", hand: "L", x: 36, y: 41, shape: "lever", r: 4 },
  { id: "rh1", label: "4", hand: "R", x: 50, y: 51 },
  { id: "rh2", label: "5", hand: "R", x: 50, y: 60 },
  { id: "rh3", label: "6", hand: "R", x: 50, y: 69 },
  { id: "eb", label: "E♭", hand: "R", x: 64, y: 74, shape: "lever", r: 4 },
  { id: "csharp", label: "C♯", hand: "R", x: 64, y: 82, shape: "lever", r: 4 },
  { id: "lowC", label: "C", hand: "R", x: 64, y: 90, shape: "lever", r: 4 },
];

const fingerings: Fingering[] = [
  { id: "c4", writtenMidi: 60, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "lowC"], hint: "Thumb and all six main fingers down, plus the low C foot key." },
  { id: "cs4", writtenMidi: 61, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "csharp"], hint: "Same as low C, but roll the right pinky up to the C♯ key." },
  { id: "d4", writtenMidi: 62, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Thumb and all six main fingers. No foot keys." },
  { id: "eb4", writtenMidi: 63, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "eb"], hint: "Six main fingers and thumb, plus the right-pinky E♭ key." },
  { id: "e4", writtenMidi: 64, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "eb"], hint: "Thumb and five fingers; lift the right ring finger off hole 6. Add the right-pinky E♭ key." },
  { id: "f4", writtenMidi: 65, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "eb"], hint: "Thumb, left hand down, right index only, plus the right-pinky E♭ key." },
  { id: "fs4", writtenMidi: 66, keys: ["thumb", "lh1", "lh2", "lh3", "rh3", "eb"], hint: "Thumb and left hand down; the right hand plays hole 6 (ring finger), not the index. Add the E♭ key." },
  { id: "g4", writtenMidi: 67, keys: ["thumb", "lh1", "lh2", "lh3", "eb"], hint: "Thumb and the three left-hand fingers. Right hand fully off except the E♭ key." },
  { id: "gs4", writtenMidi: 68, keys: ["thumb", "lh1", "lh2", "lh3", "gsharp", "eb"], hint: "Finger G and add the left-pinky G♯ key and the right-pinky E♭ key." },
  { id: "a4", writtenMidi: 69, keys: ["thumb", "lh1", "lh2", "eb"], hint: "Thumb, left index and middle fingers, plus the right-pinky E♭ key." },
  {
    id: "bb4", writtenMidi: 70,
    keys: ["thumb", "lh1", "rh1", "eb"], hint: "\"1 and 1\": thumb, left index and right index, plus the E♭ key.",
    alternates: [{
      label: "Thumb B♭", keys: ["thumbBb", "lh1", "eb"],
      hint: "Left thumb rolls onto the small B♭ lever; left index stays down, plus the E♭ key.",
      useWhen: "Common in flat keys and fast passages so the thumb doesn't have to jump; check which your own flute's thumb key is set to.",
    }],
  },
  { id: "b4", writtenMidi: 71, keys: ["thumb", "lh1", "eb"], hint: "Thumb and the left index finger, plus the E♭ key." },
  { id: "c5", writtenMidi: 72, keys: ["lh1", "eb"], hint: "Left index finger and the E♭ key. Thumb off." },
  { id: "cs5", writtenMidi: 73, keys: ["eb"], hint: "Fully open except the E♭ key." },
  { id: "d5", writtenMidi: 74, keys: ["thumb", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Thumb, left middle and ring fingers with the left index lifted, plus all three right-hand fingers." },
  { id: "eb5", writtenMidi: 75, keys: ["thumb", "lh2", "lh3", "rh1", "rh2", "rh3", "eb"], hint: "Same shape as D5, plus the right-pinky E♭ key." },
  { id: "e5", writtenMidi: 76, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "eb"], hint: "The same fingering as middle E, overblown." },
  { id: "f5", writtenMidi: 77, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "eb"], hint: "The same fingering as middle F, overblown." },
  { id: "fs5", writtenMidi: 78, keys: ["thumb", "lh1", "lh2", "lh3", "rh3", "eb"], hint: "The same fingering as middle F♯, overblown." },
  { id: "g5", writtenMidi: 79, keys: ["thumb", "lh1", "lh2", "lh3", "eb"], hint: "The same fingering as middle G, overblown." },
  { id: "gs5", writtenMidi: 80, keys: ["thumb", "lh1", "lh2", "lh3", "gsharp", "eb"], hint: "The same fingering as middle G♯, overblown." },
  { id: "a5", writtenMidi: 81, keys: ["thumb", "lh1", "lh2", "eb"], hint: "The same fingering as middle A, overblown." },
  {
    id: "bb5", writtenMidi: 82,
    keys: ["thumb", "lh1", "rh1", "eb"], hint: "Same \"1 and 1\" grip as B♭4, overblown.",
    alternates: [{
      label: "Thumb B♭", keys: ["thumbBb", "lh1", "eb"],
      hint: "Left thumb on the B♭ lever, left index down, plus the E♭ key.",
      useWhen: "Same trade-off as B♭4 -- smoother in flat keys and fast passages.",
    }],
  },
  { id: "b5", writtenMidi: 83, keys: ["thumb", "lh1", "eb"], hint: "The same fingering as B4, overblown." },
  { id: "c6", writtenMidi: 84, keys: ["lh1", "eb"], hint: "The same fingering as C5, overblown." },
  { id: "cs6", writtenMidi: 85, keys: ["eb"], hint: "The same fully-open fingering as C♯5, overblown." },
];

export const FLUTE_CHART: FingeringChart = {
  instrumentId: "flute",
  keys,
  fingerings,
  review: "method-book consensus, not yet teacher-reviewed",
};
