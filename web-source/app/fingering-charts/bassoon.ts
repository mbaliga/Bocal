import type { Fingering, FingeringChart } from "./types";

/**
 * Standard Heckel-system (German) bassoon, written pitch (concert pitch for
 * the bassoon).
 *
 * Sources cross-checked against each other for every fingering below:
 *   1. The Woodwind Fingering Guide, University of Idaho / Timothy Reichard
 *      (wfg.woodwind.org/bassoon/basn_bas_1.html, basn_bas_2.html,
 *      basn_bas_3.html) -- a text-coded fingering table (named left-thumb
 *      keys / LH123 / right-thumb keys / RH123 / pinky keys) this file is
 *      built from directly.
 *   2. Yamaha Corporation's official bassoon fingering chart
 *      (yamaha.com/en/musical_instrument_guide/common/images/bassoon/fingering.pdf),
 *      used to confirm the key layout: a cluster of low-note thumb keys on
 *      the left hand alongside the whisper key, and a second cluster of
 *      thumb keys on the right hand, which is what makes the bassoon's
 *      thumb work famously busy compared to the other three instruments
 *      here.
 *
 * Range shipped: B♭1 (the bassoon's lowest note) to G♯4. The brief's target
 * was up to E♭5, but the source's fingerings for A4 and B♭4 both lean on a
 * combined "flick key" thumb lever (used to help a slur speak cleanly) that
 * isn't wired identically on every Heckel-system bassoon, and everything
 * above that is the source's own "alternate fingerings" chart rather than
 * its basic one -- a second-source line I could not draw with confidence.
 * G♯4 is a clean, defensible stopping point: two full octaves and a fifth,
 * covering chalumeau through the start of the tenor range.
 *
 * Left out: the "flick" thumb-key variants offered throughout as smoother
 * alternatives for slurring into a note (marked "flick fingering for
 * slurs" in the source) -- real technique, but a second, situational way to
 * play a note already covered by its plain fingering, not a beginner's
 * first answer. The whisper key's own half-hole/resonance nuance on F♯3,
 * G3 and G♯3 (shown in the source as quarter- and three-quarter-covered
 * holes) is simplified to the same half-hole this chart uses for the
 * oboe -- a real bassoonist's exact cover amount varies by reed and horn
 * more than these three notes' fingerings otherwise do.
 */

const keys: FingeringChart["keys"] = [
  { id: "whisper", label: "Whisper key", hand: "thumb", x: 15, y: 8, shape: "lever", r: 4.2 },
  { id: "thumbBb", label: "Thumb B♭", hand: "thumb", x: 15, y: 16, shape: "lever", r: 4.2 },
  { id: "thumbB", label: "Thumb B", hand: "thumb", x: 15, y: 24, shape: "lever", r: 4.2 },
  { id: "thumbC", label: "Thumb C", hand: "thumb", x: 15, y: 32, shape: "lever", r: 4.2 },
  { id: "thumbCsharp", label: "Thumb C♯/D", hand: "thumb", x: 15, y: 40, shape: "lever", r: 4.2 },
  { id: "thumbD", label: "Thumb D", hand: "thumb", x: 15, y: 48, shape: "lever", r: 4.2 },
  { id: "lh1", label: "1", hand: "L", x: 46, y: 14 },
  { id: "lh2", label: "2", hand: "L", x: 46, y: 23 },
  { id: "lh3", label: "3", hand: "L", x: 46, y: 32 },
  { id: "lhCsharpSliver", label: "C♯ sliver", hand: "L", x: 60, y: 18, r: 3.4 },
  { id: "lhEbSliver", label: "E♭ sliver", hand: "L", x: 60, y: 27, r: 3.4 },
  { id: "rhThumbE", label: "Thumb E vent", hand: "thumb", x: 85, y: 38, shape: "lever", r: 4.2 },
  { id: "rhThumbFsharp", label: "Thumb F♯", hand: "thumb", x: 85, y: 46, shape: "lever", r: 4.2 },
  { id: "rhThumbGsharp", label: "Thumb G♯", hand: "thumb", x: 85, y: 54, shape: "lever", r: 4.2 },
  { id: "rhThumbBb", label: "Thumb B♭", hand: "thumb", x: 85, y: 62, shape: "lever", r: 4.2 },
  { id: "rh1", label: "4", hand: "R", x: 46, y: 43 },
  { id: "rh2", label: "5", hand: "R", x: 46, y: 52 },
  { id: "rh3", label: "6", hand: "R", x: 46, y: 61 },
  { id: "rhPinkyF", label: "F", hand: "R", x: 60, y: 68, shape: "lever", r: 3.6 },
  { id: "rhPinkyGsharp", label: "G♯", hand: "R", x: 60, y: 76, shape: "lever", r: 3.6 },
];

const fingerings: Fingering[] = [
  { id: "bb1", writtenMidi: 34, keys: ["thumbBb", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Thumb B♭ key, all six main fingers, the right-thumb E vent, and the right-pinky F key." },
  { id: "b1", writtenMidi: 35, keys: ["thumbB", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Same shape as B♭1; roll the left thumb to the B key." },
  { id: "c2", writtenMidi: 36, keys: ["thumbC", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Same shape again; left thumb on the C key." },
  { id: "cs2", writtenMidi: 37, keys: ["thumbC", "lhCsharpSliver", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Thumb stays on C; add the small C♯ sliver key near the left fingers." },
  { id: "d2", writtenMidi: 38, keys: ["thumbD", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Left thumb moves to the D key; six main fingers and the right-thumb vent stay." },
  { id: "eb2", writtenMidi: 39, keys: ["thumbD", "lhEbSliver", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Thumb stays on D; add the small E♭ sliver key." },
  { id: "e2", writtenMidi: 40, keys: ["whisper", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Left thumb moves to the whisper key for the first time; everything else as before." },
  { id: "f2", writtenMidi: 41, keys: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Whisper key and six main fingers; the right-thumb vent drops out." },
  { id: "fs2", writtenMidi: 42, keys: ["whisper", "lh1", "lh2", "lh3", "rhThumbFsharp", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Same as F2, add the right-thumb F♯ key." },
  { id: "g2", writtenMidi: 43, keys: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Whisper key and all six main fingers. No pinky key." },
  { id: "gs2", writtenMidi: 44, keys: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGsharp"], hint: "Same as G2, add the right-pinky G♯ key." },
  { id: "a2", writtenMidi: 45, keys: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Whisper key and five fingers; the right ring finger lifts." },
  { id: "bb2", writtenMidi: 46, keys: ["whisper", "lh1", "lh2", "lh3", "rhThumbBb", "rh1", "rh2"], hint: "Same as A2, add the right-thumb B♭ key." },
  { id: "b2", writtenMidi: 47, keys: ["whisper", "lh1", "lh2", "lh3", "rh1"], hint: "Whisper key, left hand down, right index only." },
  { id: "c3", writtenMidi: 48, keys: ["whisper", "lh1", "lh2", "lh3"], hint: "Whisper key and the three left-hand fingers only." },
  { id: "cs3", writtenMidi: 49, keys: ["thumbCsharp", "lh1", "lh2", "lh3"], hint: "Left thumb moves to the combined C♯/D key; same three left fingers." },
  { id: "d3", writtenMidi: 50, keys: ["whisper", "lh1", "lh2"], hint: "Whisper key, left index and middle fingers." },
  { id: "eb3", writtenMidi: 51, keys: ["whisper", "lh1", "lh3"], hint: "Whisper key, left index and ring fingers -- the middle finger lifts." },
  { id: "e3", writtenMidi: 52, keys: ["whisper", "lh1"], hint: "Whisper key and the left index finger alone." },
  { id: "f3", writtenMidi: 53, keys: ["whisper"], hint: "Whisper key only -- every finger lifts." },
  { id: "fs3", writtenMidi: 54, halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "rhThumbFsharp", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Half-hole the left index; left middle and ring down, right-thumb F♯ key, all three right fingers, right-pinky F key." },
  { id: "g3", writtenMidi: 55, halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhEbSliver", "rh1", "rh2", "rh3"], hint: "Half-hole the left index; left middle and ring down with the E♭ sliver key; all three right fingers." },
  { id: "gs3", writtenMidi: 56, halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGsharp"], hint: "Half-hole the left index; left middle and ring, all three right fingers, right-pinky G♯ key." },
  { id: "a3", writtenMidi: 57, keys: ["lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Whisper key lifts here: left hand down, right index and middle only." },
  { id: "bb3", writtenMidi: 58, keys: ["lh1", "lh2", "lh3", "rhThumbBb", "rh1", "rh2"], hint: "Same as A3, add the right-thumb B♭ key." },
  { id: "b3", writtenMidi: 59, keys: ["lh1", "lh2", "lh3", "rh1"], hint: "Left hand down, right index only. No whisper key." },
  { id: "c4", writtenMidi: 60, keys: ["lh1", "lh2", "lh3"], hint: "The three left-hand fingers only." },
  { id: "cs4", writtenMidi: 61, keys: ["thumbCsharp", "lh1", "lh2", "lh3"], hint: "Left thumb on the combined C♯/D key; same three left fingers." },
  { id: "d4", writtenMidi: 62, keys: ["lh1", "lh2"], hint: "Left index and middle fingers; the ring finger lifts." },
  { id: "eb4", writtenMidi: 63, keys: ["lh1", "lh2", "rh1", "rh2", "rh3"], hint: "Left index and middle, plus all three right-hand fingers." },
  { id: "e4", writtenMidi: 64, keys: ["lh1", "lh3", "lhEbSliver", "rh1", "rh2", "rh3"], hint: "Left index and ring (middle lifts) with the E♭ sliver key, plus all three right-hand fingers." },
  { id: "f4", writtenMidi: 65, keys: ["lh1", "lh3", "lhEbSliver", "rh1", "rh2"], hint: "Same left hand as E4; right hand drops to index and middle only." },
  { id: "fs4", writtenMidi: 66, keys: ["lh2", "lh3", "lhEbSliver", "rhThumbBb", "rh1", "rh2"], hint: "Left index lifts; left middle and ring stay down with the E♭ sliver key, right-thumb B♭ key, right index and middle." },
  { id: "g4", writtenMidi: 67, halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhEbSliver", "rh1", "rhPinkyF"], hint: "Whisper key back on; half-hole the left index, left middle and ring with the E♭ sliver key, right index, right-pinky F key." },
  { id: "gs4", writtenMidi: 68, halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhEbSliver", "rh3"], hint: "Half-hole the left index (covering closer to three-quarters), left middle and ring with the E♭ sliver key, right ring finger only." },
];

export const BASSOON_CHART: FingeringChart = {
  instrumentId: "bassoon",
  keys,
  fingerings,
  review: "method-book consensus, not yet teacher-reviewed",
};
