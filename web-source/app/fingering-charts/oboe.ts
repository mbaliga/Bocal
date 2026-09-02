import type { Fingering, FingeringChart } from "./types";

/**
 * Standard conservatoire-system oboe, written pitch (concert pitch for the
 * oboe; the cor anglais reuses this chart -- see index.ts and the
 * disclosure shown alongside it).
 *
 * Sources cross-checked against each other for every fingering below:
 *   1. The Woodwind Fingering Guide, University of Idaho / Timothy Reichard
 *      (wfg.woodwind.org/oboe/ob_bas_1.html, ob_bas_2.html, ob_bas_3.html)
 *      -- a text-coded fingering table (LH123 / RH123 / half-hole / octave
 *      keys / side and pinky keys) this file is built from directly.
 *   2. Yamaha Corporation's official oboe fingering chart image
 *      (yamaha.com/en/musical_instrument_guide/common/images/oboe/play_p04_01.jpg),
 *      whose key legend and layout -- left thumb octave key, three-plus-
 *      three main rings, a half-hole on the left index finger, low pinky
 *      keys on the right -- confirms the same mechanism described in
 *      source 1.
 *
 * Range shipped: B♭3 (the oboe's lowest note) to F6, exactly the brief's
 * target and the Woodwind Fingering Guide's own "third octave" chart
 * boundary. E6 and F6 both rely on a combined G♯/E♭ left-hand key
 * (`lhGsharpEb` below) that not every oboe has wired the same way, so if
 * your reed doesn't want to speak on either of those two, that combined key
 * is the first thing to check with a teacher.
 *
 * Left out: forked/resonance alternates and the open-hole vs closed-hole
 * trill variants the source lists for several throat and third-octave notes
 * -- real, useful, but not what a beginner reaches for first, and the point
 * of "primary fingering per note" is to show that one first.
 */

const keys: FingeringChart["keys"] = [
  { id: "octave1", label: "Octave key I", hand: "thumb", x: 35, y: 6, r: 4.4 },
  { id: "octave2", label: "Octave key II", hand: "thumb", x: 55, y: 6, r: 4.4 },
  { id: "lh1", label: "1", hand: "L", x: 50, y: 17 },
  { id: "lh2", label: "2", hand: "L", x: 50, y: 26 },
  { id: "lh3", label: "3", hand: "L", x: 50, y: 35 },
  { id: "lhBb", label: "B♭", hand: "L", x: 68, y: 13, r: 3.6 },
  { id: "lhB", label: "B", hand: "L", x: 68, y: 19, r: 3.6 },
  { id: "lhEb", label: "E♭", hand: "L", x: 68, y: 25, r: 3.6 },
  { id: "lhF", label: "F", hand: "L", x: 68, y: 31, r: 3.6 },
  { id: "lhGsharp", label: "G♯", hand: "L", x: 32, y: 39, shape: "lever", r: 3.8 },
  { id: "lhGsharpEb", label: "G♯/E♭", hand: "L", x: 32, y: 45, shape: "lever", r: 3.8 },
  { id: "rh1", label: "4", hand: "R", x: 50, y: 49 },
  { id: "rh2", label: "5", hand: "R", x: 50, y: 58 },
  { id: "rh3", label: "6", hand: "R", x: 50, y: 67 },
  { id: "fRes", label: "F resonance", hand: "R", x: 34, y: 61, r: 3.4 },
  { id: "rhC", label: "C", hand: "R", x: 68, y: 73, shape: "lever", r: 3.8 },
  { id: "rhCsharp", label: "C♯", hand: "R", x: 68, y: 79, shape: "lever", r: 3.8 },
  { id: "rhEb", label: "E♭", hand: "R", x: 68, y: 85, shape: "lever", r: 3.8 },
];

const fingerings: Fingering[] = [
  { id: "bb3", writtenMidi: 58, keys: ["lh1", "lh2", "lh3", "lhBb", "rh1", "rh2", "rh3", "rhC"], hint: "All six main fingers, plus the left-hand B♭ key and the right-pinky C key." },
  { id: "b3", writtenMidi: 59, keys: ["lh1", "lh2", "lh3", "lhB", "rh1", "rh2", "rh3", "rhC"], hint: "Same six fingers; swap the left-hand key to B, keep the pinky C key." },
  { id: "c4", writtenMidi: 60, keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhC"], hint: "All six main fingers plus the right-pinky C key. No left-hand key." },
  { id: "cs4", writtenMidi: 61, keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhCsharp"], hint: "Same six fingers; roll the right pinky to the C♯ key." },
  { id: "d4", writtenMidi: 62, keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "All six main fingers. No pinky key." },
  { id: "eb4", writtenMidi: 63, keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhEb"], hint: "Same six fingers, add the right-pinky E♭ key." },
  { id: "e4", writtenMidi: 64, keys: ["lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Five fingers; lift the right ring finger off hole 6." },
  { id: "f4", writtenMidi: 65, keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "fRes"], hint: "Same five fingers as E4, plus the small F resonance key." },
  { id: "fs4", writtenMidi: 66, keys: ["lh1", "lh2", "lh3", "rh1"], hint: "Left hand down, right index only." },
  { id: "g4", writtenMidi: 67, keys: ["lh1", "lh2", "lh3"], hint: "The three left-hand fingers only." },
  { id: "gs4", writtenMidi: 68, keys: ["lh1", "lh2", "lh3", "lhGsharp"], hint: "Same as G4, add the left-hand G♯ key." },
  { id: "a4", writtenMidi: 69, keys: ["lh1", "lh2"], hint: "Left index and middle fingers." },
  { id: "bb4", writtenMidi: 70, keys: ["lh1", "lh2", "rh1"], hint: "Left index and middle, plus the right index finger." },
  { id: "b4", writtenMidi: 71, keys: ["lh1"], hint: "Left index finger alone." },
  { id: "c5", writtenMidi: 72, keys: ["lh1", "rh1"], hint: "Left and right index fingers only." },
  { id: "cs5", writtenMidi: 73, halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3", "rhCsharp"], hint: "Half-hole the left index finger; the rest is the C♯4 fingering." },
  { id: "d5", writtenMidi: 74, halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Half-hole the left index; the rest is the D4 fingering." },
  { id: "eb5", writtenMidi: 75, halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3", "rhEb"], hint: "Half-hole the left index; the rest is the E♭4 fingering." },
  { id: "e5", writtenMidi: 76, keys: ["octave1", "lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Add the first octave key to the E4 fingering." },
  { id: "f5", writtenMidi: 77, keys: ["octave1", "lh1", "lh2", "lh3", "rh1", "rh2", "fRes"], hint: "Add the first octave key to the F4 fingering." },
  { id: "fs5", writtenMidi: 78, keys: ["octave1", "lh1", "lh2", "lh3", "rh1"], hint: "Add the first octave key to the F♯4 fingering." },
  { id: "g5", writtenMidi: 79, keys: ["octave1", "lh1", "lh2", "lh3"], hint: "Add the first octave key to the G4 fingering." },
  { id: "gs5", writtenMidi: 80, keys: ["octave1", "lh1", "lh2", "lh3", "lhGsharp"], hint: "Add the first octave key to the G♯4 fingering." },
  { id: "a5", writtenMidi: 81, keys: ["octave2", "lh1", "lh2"], hint: "The second octave key, left index and middle fingers." },
  { id: "bb5", writtenMidi: 82, keys: ["octave2", "lh1", "lh2", "rh1"], hint: "Second octave key, left index and middle, plus right index." },
  { id: "b5", writtenMidi: 83, keys: ["octave2", "lh1"], hint: "Second octave key and the left index finger alone." },
  { id: "c6", writtenMidi: 84, keys: ["octave2", "lh1", "rh1"], hint: "Second octave key, left and right index fingers." },
  { id: "cs6", writtenMidi: 85, keys: ["lh2", "lh3", "rh1", "rhC"], hint: "No octave key: left middle and ring fingers, right index, and the pinky C key." },
  { id: "d6", writtenMidi: 86, halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rhC"], hint: "Half-hole the left index, left middle and ring down, right index, pinky C key." },
  { id: "eb6", writtenMidi: 87, halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh2", "rh3", "rhEb"], hint: "Half-hole the left index, left middle and ring down, right middle and ring, pinky E♭ key." },
  { id: "e6", writtenMidi: 88, keys: ["octave1", "lh2", "lh3", "lhGsharpEb", "rh2", "rh3"], halfKeys: ["lh1"], hint: "First octave key, half-hole the left index, and the combined G♯/E♭ key." },
  { id: "f6", writtenMidi: 89, keys: ["octave1", "lh2", "lhGsharpEb", "rh2", "rh3"], halfKeys: ["lh1"], hint: "Same shape as E6, left ring finger lifts off." },
];

export const OBOE_CHART: FingeringChart = {
  instrumentId: "oboe",
  keys,
  fingerings,
  review: "method-book consensus, not yet teacher-reviewed",
};
