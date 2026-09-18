import type { Fingering, FingeringChart } from "./types";

/**
 * Standard Boehm flute (closed G#, C-foot -- no low B), method-book
 * fingerings, written pitch (the flute is non-transposing, so written and
 * concert pitch match).
 *
 * Sources cross-checked against each other for every fingering below:
 *   1. The Woodwind Fingering Guide, University of Idaho / Timothy Reichard
 *      (wfg.woodwind.org/flute/fl_bas_1.html, fl_bas_2.html, fl_bas_3.html)
 *      -- a text-coded fingering table (thumb / LH123 / RH123 / foot keys)
 *      this file is built from directly, including the third octave
 *      (fl_bas_3.html), confirmed 2026-09-18.
 *   2. Yamaha Corporation's official "Flute Fingerings" chart
 *      (data.yamaha.com/files/download/other_assets/9/320499/flutes_fingerings.pdf),
 *      spot-checked against several notes (low C4, the Bb4 "1-and-1" grip)
 *      to confirm the key layout and touch pattern; and, for D6-C7,
 *      flutetunes.com's "Basic Flute Fingerings" chart
 *      (flutetunes.com/fingerings/basic-fingerings.php, confirmed
 *      2026-09-18) checked note by note (thumb on/off, each of LH1-3 and
 *      RH1-3 open/closed, and the E♭ key) against the WFG transcription
 *      below -- including that A♯6/B♭6 and B6 each use one of the layout's
 *      two trill keys as their primary fingering, which flutetunes.com
 *      marks with its own separate key-position indicator in the same spot.
 *
 * Range shipped: C4 to C7, the brief's full target. A prior version of this
 * file stopped at C♯6, on the belief that WFG's third-octave chart was
 * icon-only; re-checked directly against wfg.woodwind.org, fl_bas_3.html is
 * the same text-coded table format as the first two octaves and transcribes
 * cleanly.
 *
 * Left out: the low-B foot joint (brief said skip it).
 *
 * The E♭ (D♯) key: WFG fl_bas_1/2/3 documents it held down on E4 through B4
 * and their octave-5 and octave-6 equivalents (skipping the D naturals,
 * which never need it on a closed-G♯ flute) -- it is standard teaching,
 * without it those notes are flat and stuffy. D6 is the one place the
 * source breaks that pattern and does add the E♭ key (a third-octave
 * vents-differently quirk, not a copy-paste). The key then drops out for
 * good at A♯6/B♭6, where the source's own primary fingering stops using it
 * (confirmed by the same drop in flutetunes.com's diagram) -- every
 * fingering below transcribes exactly which notes have it, so this is a
 * summary, not a rule this file derives fingerings from.
 *
 * The two small chromatic trill keys drawn in the layout (for an honest
 * picture of the instrument) are pressed by only two fingerings below --
 * A♯6/B♭6 (the "D trill" key) and B6 (the "D♯ trill" key) -- exactly as
 * WFG's own basic chart uses them there, not as a trill-only shortcut.
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
  { id: "d6", writtenMidi: 86, keys: ["thumb", "lh2", "lh3", "eb"], hint: "Thumb, left middle and ring fingers (index lifted), plus the E♭ key." },
  { id: "eb6", writtenMidi: 87, keys: ["thumb", "lh1", "lh2", "lh3", "gsharp", "rh1", "rh2", "rh3", "eb"], hint: "Thumb, all six main fingers and the G♯ key, plus the E♭ key." },
  { id: "e6", writtenMidi: 88, keys: ["thumb", "lh1", "lh2", "rh1", "rh2", "eb"], hint: "Thumb, left index and middle, right index and middle, plus the E♭ key." },
  { id: "f6", writtenMidi: 89, keys: ["thumb", "lh1", "lh3", "rh1", "eb"], hint: "Thumb, left index and ring (middle lifted), right index only, plus the E♭ key." },
  { id: "fs6", writtenMidi: 90, keys: ["thumb", "lh1", "lh3", "rh3", "eb"], hint: "Thumb, left index and ring, right ring finger only, plus the E♭ key." },
  { id: "g6", writtenMidi: 91, keys: ["lh1", "lh2", "lh3", "eb"], hint: "Left hand down, thumb off, plus the E♭ key." },
  { id: "gs6", writtenMidi: 92, keys: ["lh2", "lh3", "gsharp", "eb"], hint: "Left middle and ring (index lifted) with the G♯ key, thumb off, plus the E♭ key." },
  { id: "a6", writtenMidi: 93, keys: ["thumb", "lh2", "rh1", "eb"], hint: "Thumb, left middle finger only, right index only, plus the E♭ key." },
  {
    id: "bb6", writtenMidi: 94, keys: ["thumb", "rh1", "trill1"],
    hint: "Thumb and the right index finger, plus the D trill key -- the E♭ key drops out here.",
  },
  {
    id: "b6", writtenMidi: 95, keys: ["thumb", "lh1", "lh3", "trill2"],
    hint: "Thumb, left index and ring (middle lifted), plus the D♯ trill key -- no E♭ key.",
  },
  { id: "c7", writtenMidi: 96, keys: ["lh1", "lh2", "lh3", "gsharp", "rh1"], hint: "Left hand down with the G♯ key, thumb off, right index only. No E♭ key." },
];

export const FLUTE_CHART: FingeringChart = {
  instrumentId: "flute",
  keys,
  fingerings,
  review: "method-book consensus, not yet teacher-reviewed",
};
