export type GuitarString = {
  id: string;
  label: string;
  midi: number;
  course: number;
};

export type GuitarTuning = {
  id: string;
  label: string;
  detail: string;
  strings: GuitarString[];
};

export type GuitarChord = {
  id: string;
  name: string;
  root: string;
  rootMidi: number;
  frets: Array<number | null>;
  fingers: number[];
  description: string;
};

export const FINGER_COLORS: Record<number, { label: string; color: string }> = {
  1: { label: "Index", color: "#08fed5" },
  2: { label: "Middle", color: "#9f8cff" },
  3: { label: "Ring", color: "#ffbf62" },
  4: { label: "Pinky", color: "#ff6f8f" },
};

export const GUITAR_TUNINGS: GuitarTuning[] = [
  {
    id: "standard",
    label: "Standard",
    detail: "E A D G B E",
    strings: [
      { id: "e2", label: "E2", midi: 40, course: 6 },
      { id: "a2", label: "A2", midi: 45, course: 5 },
      { id: "d3", label: "D3", midi: 50, course: 4 },
      { id: "g3", label: "G3", midi: 55, course: 3 },
      { id: "b3", label: "B3", midi: 59, course: 2 },
      { id: "e4", label: "E4", midi: 64, course: 1 },
    ],
  },
  {
    id: "drop-d",
    label: "Drop D",
    detail: "D A D G B E",
    strings: [
      { id: "d2", label: "D2", midi: 38, course: 6 },
      { id: "a2", label: "A2", midi: 45, course: 5 },
      { id: "d3", label: "D3", midi: 50, course: 4 },
      { id: "g3", label: "G3", midi: 55, course: 3 },
      { id: "b3", label: "B3", midi: 59, course: 2 },
      { id: "e4", label: "E4", midi: 64, course: 1 },
    ],
  },
  {
    id: "open-g",
    label: "Open G",
    detail: "D G D G B D",
    strings: [
      { id: "d2", label: "D2", midi: 38, course: 6 },
      { id: "g2", label: "G2", midi: 43, course: 5 },
      { id: "d3", label: "D3", midi: 50, course: 4 },
      { id: "g3", label: "G3", midi: 55, course: 3 },
      { id: "b3", label: "B3", midi: 59, course: 2 },
      { id: "d4", label: "D4", midi: 62, course: 1 },
    ],
  },
];

export const GUITAR_CHORDS: GuitarChord[] = [
  { id: "g", name: "G", root: "G", rootMidi: 43, frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], description: "Keep the open middle strings ringing." },
  { id: "d", name: "D", root: "D", rootMidi: 50, frets: [null, null, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], description: "Strum from the fourth string down." },
  { id: "em", name: "Em", root: "E", rootMidi: 40, frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], description: "Two fingers; let every other string ring." },
  { id: "c", name: "C", root: "C", rootMidi: 48, frets: [null, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], description: "Strum from the fifth string down." },
  { id: "am", name: "Am", root: "A", rootMidi: 45, frets: [null, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], description: "A compact shape with a clear open A bass." },
  { id: "fmaj7", name: "Fmaj7", root: "F", rootMidi: 41, frets: [null, null, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], description: "A gentle F colour without a barre." },
];

export const FOUR_CHORD_FLOW = ["g", "d", "em", "c"] as const;

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}
