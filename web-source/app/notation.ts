// Note-naming systems.
//
// The app used to carry a single hardcoded NOTE_NAMES array, which quietly
// assumed every player reads C/D/E. Bocal's players don't: a student trained in
// a Romance-language conservatory reads Do/Re/Mi as absolute pitches, and a
// student trained in Hindustani or Carnatic music reads Sa/Re/Ga relative to a
// chosen tonic. Both are correct, and neither is a translation of the other, so
// the naming system is modelled as data rather than baked into the tuner.

export type NotationSystem = "western" | "solfege" | "sargam" | "staff";

/**
 * How a pitch class is spelled on a staff: a letter (0 = C … 6 = B) plus an
 * accidental in semitones. The app spells black keys the way wind method books
 * do -- sharps below the tonic-ish middle, flats above -- so this table is the
 * single source of truth for both the letter names and the staff renderer.
 */
export type Spelling = { letter: number; accidental: -1 | 0 | 1 };

const SPELLINGS: Spelling[] = [
  { letter: 0, accidental: 0 }, // C
  { letter: 0, accidental: 1 }, // C sharp
  { letter: 1, accidental: 0 }, // D
  { letter: 2, accidental: -1 }, // E flat
  { letter: 2, accidental: 0 }, // E
  { letter: 3, accidental: 0 }, // F
  { letter: 3, accidental: 1 }, // F sharp
  { letter: 4, accidental: 0 }, // G
  { letter: 5, accidental: -1 }, // A flat
  { letter: 5, accidental: 0 }, // A
  { letter: 6, accidental: -1 }, // B flat
  { letter: 6, accidental: 0 }, // B
];

export function spellingFor(midi: number): Spelling {
  return SPELLINGS[((midi % 12) + 12) % 12];
}

const WESTERN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

// Fixed-do, as taught in France, Italy and Spain: Do is always C, never the
// tonic of the piece. Movable-do would need to know the key, which the tuner
// does not and cannot infer from one sustained note.
const SOLFEGE = ["Do", "Do♯", "Re", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "La♭", "La", "Si♭", "Si"];

// Sargam swaras as intervals above Sa. Komal (flat) degrees are marked with an
// underline in print; we use the lowercase convention that carries in plain
// text, which is what students read in most modern teaching material.
const SARGAM = ["Sa", "re", "Re", "ga", "Ga", "Ma", "ma", "Pa", "dha", "Dha", "ni", "Ni"];

export type NotationProfile = {
  id: NotationSystem;
  label: string;
  /** Shown under the selector so the choice's assumptions are visible. */
  description: string;
  /** True when the naming depends on a tonic the player picks. */
  needsTonic: boolean;
};

export const NOTATION_SYSTEMS: Record<NotationSystem, NotationProfile> = {
  western: {
    id: "western",
    label: "A B C",
    description: "Letter names, the default in English-language method books.",
    needsTonic: false,
  },
  solfege: {
    id: "solfege",
    label: "Do Re Mi",
    description: "Fixed-do solfège: Do is always C, whatever key you are playing in.",
    needsTonic: false,
  },
  sargam: {
    id: "sargam",
    label: "Sa Re Ga",
    description: "Sargam swaras counted from the Sa you choose. Capitals are shuddha, lowercase komal.",
    needsTonic: true,
  },
  staff: {
    id: "staff",
    label: "Staff",
    description: "The note drawn where it sits on the stave, with its accidental and ledger lines.",
    needsTonic: false,
  },
};

export const NOTATION_ORDER: NotationSystem[] = ["western", "solfege", "sargam", "staff"];

/**
 * Name a pitch class. `tonic` is the pitch class treated as Sa and is ignored
 * by the systems that name absolute pitches.
 *
 * The staff system has no text form -- it is drawn, not spelled -- so it falls
 * back to letter names anywhere a string is required (an aria-label, an export
 * row, a compact chip).
 */
export function noteName(midi: number, system: NotationSystem, tonic = 0): string {
  const pc = ((midi % 12) + 12) % 12;
  switch (system) {
    case "solfege":
      return SOLFEGE[pc];
    case "sargam":
      return SARGAM[((pc - tonic) % 12 + 12) % 12];
    case "western":
    case "staff":
    default:
      return WESTERN[pc];
  }
}

/** Scientific pitch notation octave number, where middle C is C4. */
export function octaveOf(midi: number) {
  return Math.floor(midi / 12) - 1;
}

/**
 * Sargam repeats every octave around Sa rather than around C, so the octave
 * marker has to be counted from the tonic or the numbers drift by one for any
 * Sa above C.
 */
export function octaveLabel(midi: number, system: NotationSystem, tonic = 0): string {
  if (system !== "sargam") return String(octaveOf(midi));
  return String(Math.floor((midi - tonic) / 12) - 1);
}

/** The full display string, e.g. "E♭4" or "Ga3". */
export function fullNoteLabel(midi: number, system: NotationSystem, tonic = 0): string {
  return `${noteName(midi, system, tonic)}${octaveLabel(midi, system, tonic)}`;
}

export const TONIC_CHOICES = WESTERN.map((name, pc) => ({ pc, name }));

export function midiFromFrequency(hz: number) {
  return 69 + 12 * Math.log2(hz / 440);
}

export function frequencyFromMidi(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}
