import type { Fingering, FingeringChart } from "./types";

/**
 * Standard Boehm-system B♭ clarinet, written pitch (transposition to
 * concert pitch is handled by `instruments.ts`'s `writtenOffset`).
 *
 * Sources cross-checked against each other for every fingering below:
 *   1. The Woodwind Fingering Guide, University of Idaho / Timothy Reichard
 *      (wfg.woodwind.org/clarinet/cl_bas_1.html "Chalumeau Register" and
 *      cl_bas_2.html "Clarion Register") -- a text-coded fingering table
 *      (thumb / register key / LH123 / RH123 / side keys / pinky keys) this
 *      file is built from directly. Internally verified against itself: the
 *      register key raises every chalumeau fingering by exactly a twelfth
 *      (19 semitones) into its clarion equivalent, which checks out for all
 *      14 notes shared between the two registers here.
 *   2. Yamaha Corporation's official clarinet fingering diagram
 *      (yamaha.com/en/musical_instrument_guide/clarinet/play/play002.html)
 *      and its "Fingering Scheme for Clarinet" key-naming reference
 *      (wfg.woodwind.org/clarinet/cl_fing.html), used to confirm the key
 *      layout: one register key, three-plus-three main rings, two left-hand
 *      side keys (G♯, A), four right-hand side keys, and four pinky keys on
 *      each hand (E, F, F♯, C♯ on the left; E, F, F♯, G♯ on the right,
 *      doubling the left-hand cluster so a passage can be fingered with
 *      whichever pinky is free).
 *
 * Range shipped: E3 (the clarinet's lowest note) to C6 (the top of the
 * clarion register). C6 is a deliberate stop, not an oversight: the brief's
 * suggested top of C7 sits deep in the altissimo register, which the brief
 * also says explicitly to leave out ("standard range only; no altissimo").
 * Altissimo fingerings are also where clarinet references genuinely
 * disagree with each other, so there is no clean "two sources agree" answer
 * above C6 to give a beginner anyway.
 *
 * Left out: the left/right pinky choice itself. Nearly every chalumeau and
 * clarion note below has two mechanically-identical options (a left-pinky
 * key or its right-pinky twin), and which one a player reaches for depends
 * on the note before and after it -- genuine technique, not a fingering
 * fact. This chart always uses the right-pinky version as the single
 * primary, and skips the left-pinky twin and the pure trill-only forks (the
 * source labels these "Trill fingering with X" -- not primary content).
 */

const keys: FingeringChart["keys"] = [
  { id: "thumb", label: "Thumb hole", hand: "thumb", x: 38, y: 6, r: 5 },
  { id: "register", label: "Register key", hand: "thumb", x: 58, y: 6, r: 4 },
  { id: "lhSideGsharp", label: "Side G♯", hand: "L", x: 70, y: 15, r: 3.6 },
  { id: "lhSideA", label: "Side A", hand: "L", x: 70, y: 21, r: 3.6 },
  { id: "lh1", label: "1", hand: "L", x: 50, y: 19 },
  { id: "lh2", label: "2", hand: "L", x: 50, y: 28 },
  { id: "lh3", label: "3", hand: "L", x: 50, y: 37 },
  { id: "lhPinkyE", label: "E", hand: "L", x: 28, y: 43, shape: "lever", r: 3.6 },
  { id: "lhPinkyF", label: "F", hand: "L", x: 28, y: 49, shape: "lever", r: 3.6 },
  { id: "lhPinkyFs", label: "F♯", hand: "L", x: 28, y: 55, shape: "lever", r: 3.6 },
  { id: "lhPinkyCs", label: "C♯", hand: "L", x: 28, y: 61, shape: "lever", r: 3.6 },
  { id: "rh1", label: "1", hand: "R", x: 50, y: 49 },
  { id: "rh2", label: "2", hand: "R", x: 50, y: 58 },
  { id: "rh3", label: "3", hand: "R", x: 50, y: 67 },
  { id: "rhSide1", label: "Side 1", hand: "R", x: 70, y: 42, r: 3.4 },
  { id: "rhSide2", label: "Side 2", hand: "R", x: 70, y: 48, r: 3.4 },
  { id: "rhSide3", label: "Side 3", hand: "R", x: 70, y: 54, r: 3.4 },
  { id: "rhSide4", label: "Side E♭/B♭", hand: "R", x: 70, y: 60, r: 3.6 },
  { id: "rhPinkyE", label: "E", hand: "R", x: 71, y: 73, shape: "lever", r: 3.6 },
  { id: "rhPinkyF", label: "F", hand: "R", x: 71, y: 79, shape: "lever", r: 3.6 },
  { id: "rhPinkyFs", label: "F♯", hand: "R", x: 71, y: 85, shape: "lever", r: 3.6 },
  { id: "rhPinkyGs", label: "G♯", hand: "R", x: 71, y: 91, shape: "lever", r: 3.6 },
];

const chalumeau: Fingering[] = [
  { id: "e3", writtenMidi: 52, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyE"], hint: "Thumb and all six main rings, plus the right-pinky E key." },
  { id: "f3", writtenMidi: 53, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Same as low E, roll the right pinky to the F key." },
  { id: "fs3", writtenMidi: 54, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyFs"], hint: "Same six rings, right pinky on the F♯ key." },
  { id: "g3", writtenMidi: 55, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Thumb and all six main rings. No pinky key." },
  { id: "gs3", writtenMidi: 56, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGs"], hint: "Same as G3, add the right-pinky G♯ key." },
  { id: "a3", writtenMidi: 57, keys: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Thumb and five fingers; lift the right ring finger." },
  { id: "bb3", writtenMidi: 58, keys: ["thumb", "lh1", "lh2", "lh3", "rh1"], hint: "Thumb, left hand down, right index only." },
  { id: "b3", writtenMidi: 59, keys: ["thumb", "lh1", "lh2", "lh3", "rh2"], hint: "Thumb and left hand down; right hand plays ring 2, not the index." },
  { id: "c4", writtenMidi: 60, keys: ["thumb", "lh1", "lh2", "lh3"], hint: "Thumb and the three left-hand rings only." },
  { id: "cs4", writtenMidi: 61, keys: ["thumb", "lh1", "lh2", "lh3", "lhPinkyCs"], hint: "Same as C4, add the left-pinky C♯ key." },
  { id: "d4", writtenMidi: 62, keys: ["thumb", "lh1", "lh2"], hint: "Thumb, left index and middle; the ring finger lifts." },
  { id: "eb4", writtenMidi: 63, keys: ["thumb", "lh1", "lh2", "rhSide4"], hint: "Thumb and two left fingers, plus the lower right-hand side key." },
  { id: "e4", writtenMidi: 64, keys: ["thumb", "lh1"], hint: "Thumb and the left index finger only." },
  { id: "f4", writtenMidi: 65, keys: ["thumb"], hint: "Thumb hole only -- every finger lifts." },
  { id: "fs4", writtenMidi: 66, keys: ["lh1"], hint: "Left index finger only; thumb lifts off the thumb hole." },
  { id: "g4", writtenMidi: 67, keys: [], hint: "Fully open throat tone -- no keys, no thumb." },
  { id: "gs4", writtenMidi: 68, keys: ["lhSideGsharp"], hint: "The left-hand side G♯ key alone, pressed with the base of the index finger." },
  { id: "a4", writtenMidi: 69, keys: ["lhSideA"], hint: "The left-hand top A key alone, rolling the index finger upward." },
  { id: "bb4", writtenMidi: 70, keys: ["register", "lhSideA"], hint: "Register key plus the top A key -- the classic \"throat B♭\" fingering." },
];

const clarion: Fingering[] = [
  { id: "b4", writtenMidi: 71, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyE"], hint: "Add the register key to the low-E fingering; the twelfth above chalumeau E." },
  { id: "c5", writtenMidi: 72, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"], hint: "Register key plus the chalumeau-F fingering." },
  { id: "cs5", writtenMidi: 73, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyFs"], hint: "Register key plus the chalumeau-F♯ fingering." },
  { id: "d5", writtenMidi: 74, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"], hint: "Register key plus the chalumeau-G fingering." },
  { id: "eb5", writtenMidi: 75, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGs"], hint: "Register key plus the chalumeau-G♯ fingering." },
  { id: "e5", writtenMidi: 76, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2"], hint: "Register key plus the chalumeau-A fingering." },
  { id: "f5", writtenMidi: 77, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh1"], hint: "Register key plus the chalumeau-B♭ fingering." },
  { id: "fs5", writtenMidi: 78, keys: ["register", "thumb", "lh1", "lh2", "lh3", "rh2"], hint: "Register key plus the chalumeau-B fingering." },
  { id: "g5", writtenMidi: 79, keys: ["register", "thumb", "lh1", "lh2", "lh3"], hint: "Register key plus the chalumeau-C fingering." },
  { id: "gs5", writtenMidi: 80, keys: ["register", "thumb", "lh1", "lh2", "lh3", "lhPinkyCs"], hint: "Register key plus the chalumeau-C♯ fingering." },
  { id: "a5", writtenMidi: 81, keys: ["register", "thumb", "lh1", "lh2"], hint: "Register key plus the chalumeau-D fingering." },
  { id: "bb5", writtenMidi: 82, keys: ["register", "thumb", "lh1", "lh2", "rhSide4"], hint: "Register key plus the chalumeau-E♭ fingering." },
  { id: "b5", writtenMidi: 83, keys: ["register", "thumb", "lh1"], hint: "Register key plus the chalumeau-E fingering." },
  { id: "c6", writtenMidi: 84, keys: ["register", "thumb"], hint: "Register key and the thumb hole only -- the twelfth above chalumeau F." },
];

export const CLARINET_CHART: FingeringChart = {
  instrumentId: "clarinet",
  keys,
  fingerings: [...chalumeau, ...clarion],
  review: "method-book consensus, not yet teacher-reviewed",
};
