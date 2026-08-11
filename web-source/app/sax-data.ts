export type SaxKeyId =
  | "octave"
  | "lh1"
  | "bis"
  | "lh2"
  | "lh3"
  | "gsharp"
  | "lowCsharp"
  | "lowB"
  | "lowBb"
  | "rh1"
  | "rh2"
  | "rh3"
  | "lowC"
  | "lowEb"
  | "sideBb"
  | "sideC"
  | "sideFsharp"
  | "palmD"
  | "palmEb"
  | "palmF"
  | "frontF"
  | "sideE";

export type SaxKey = {
  id: SaxKeyId;
  short: string;
  name: string;
  hand: "Left" | "Right";
  finger: string;
  position: [number, number, number];
  side?: "left" | "right" | "back";
};

export type Fingering = {
  id: string;
  note: string;
  octave: number;
  midi: number;
  keys: SaxKeyId[];
  level: "Low" | "Middle" | "Upper";
  hint: string;
};

export const SAX_KEYS: SaxKey[] = [
  { id: "octave", short: "Oct", name: "Octave key", hand: "Left", finger: "Thumb", position: [-0.27, 2.72, -0.26], side: "back" },
  { id: "frontF", short: "F↑", name: "Front F key", hand: "Left", finger: "Index", position: [-0.34, 2.56, 0.34], side: "left" },
  { id: "lh1", short: "1", name: "B key", hand: "Left", finger: "Index", position: [-0.22, 2.14, 0.38] },
  { id: "bis", short: "Bis", name: "Bis B♭ key", hand: "Left", finger: "Index", position: [0.17, 1.91, 0.39], side: "right" },
  { id: "lh2", short: "2", name: "A key", hand: "Left", finger: "Middle", position: [-0.22, 1.51, 0.39] },
  { id: "lh3", short: "3", name: "G key", hand: "Left", finger: "Ring", position: [-0.22, 0.86, 0.4] },
  { id: "palmD", short: "D", name: "High D palm key", hand: "Left", finger: "Palm", position: [-0.54, 2.24, 0.02], side: "left" },
  { id: "palmEb", short: "E♭", name: "High E♭ palm key", hand: "Left", finger: "Palm", position: [-0.62, 1.69, 0.02], side: "left" },
  { id: "palmF", short: "F", name: "High F palm key", hand: "Left", finger: "Palm", position: [-0.59, 1.11, 0.02], side: "left" },
  { id: "gsharp", short: "G♯", name: "G♯ key", hand: "Left", finger: "Pinky", position: [-0.62, 0.32, 0.25], side: "left" },
  { id: "lowCsharp", short: "C♯", name: "Low C♯ key", hand: "Left", finger: "Pinky", position: [-0.66, -0.12, 0.22], side: "left" },
  { id: "lowB", short: "B", name: "Low B key", hand: "Left", finger: "Pinky", position: [-0.68, -0.54, 0.18], side: "left" },
  { id: "lowBb", short: "B♭", name: "Low B♭ key", hand: "Left", finger: "Pinky", position: [-0.65, -0.94, 0.12], side: "left" },
  { id: "rh1", short: "1", name: "F key", hand: "Right", finger: "Index", position: [0.23, 0.18, 0.42] },
  { id: "rh2", short: "2", name: "E key", hand: "Right", finger: "Middle", position: [0.23, -0.49, 0.43] },
  { id: "rh3", short: "3", name: "D key", hand: "Right", finger: "Ring", position: [0.23, -1.14, 0.42] },
  { id: "sideC", short: "C", name: "Side C key", hand: "Right", finger: "Index side", position: [0.62, 0.4, 0.2], side: "right" },
  { id: "sideBb", short: "B♭", name: "Side B♭ key", hand: "Right", finger: "Index side", position: [0.65, -0.02, 0.18], side: "right" },
  { id: "sideFsharp", short: "F♯", name: "Side F♯ key", hand: "Right", finger: "Ring side", position: [0.64, -0.73, 0.13], side: "right" },
  { id: "sideE", short: "E↑", name: "High E side key", hand: "Right", finger: "Index side", position: [0.64, 0.83, 0.11], side: "right" },
  { id: "lowC", short: "C", name: "Low C key", hand: "Right", finger: "Pinky", position: [0.59, -1.54, 0.21], side: "right" },
  { id: "lowEb", short: "E♭", name: "Low E♭ key", hand: "Right", finger: "Pinky", position: [0.61, -1.9, 0.14], side: "right" },
];

const baseSix: SaxKeyId[] = ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3"];
const oct = (keys: SaxKeyId[]) => ["octave", ...keys] as SaxKeyId[];

export const ALTO_FINGERINGS: Fingering[] = [
  { id: "bb3", note: "B♭", octave: 3, midi: 58, keys: [...baseSix, "lowBb"], level: "Low", hint: "All six main fingers, then roll the left pinky to low B♭." },
  { id: "b3", note: "B", octave: 3, midi: 59, keys: [...baseSix, "lowB"], level: "Low", hint: "All six main fingers with the left-pinky low B key." },
  { id: "c4", note: "C", octave: 4, midi: 60, keys: [...baseSix, "lowC"], level: "Low", hint: "All six main fingers with the right-pinky low C key." },
  { id: "cs4", note: "C♯", octave: 4, midi: 61, keys: [...baseSix, "lowCsharp"], level: "Low", hint: "All six main fingers with the left-pinky low C♯ key." },
  { id: "d4", note: "D", octave: 4, midi: 62, keys: baseSix, level: "Low", hint: "Close the six main pearl keys. Keep both pinkies relaxed." },
  { id: "eb4", note: "E♭", octave: 4, midi: 63, keys: [...baseSix, "lowEb"], level: "Low", hint: "Six main keys plus the right-pinky E♭ key." },
  { id: "e4", note: "E", octave: 4, midi: 64, keys: ["lh1", "lh2", "lh3", "rh1", "rh2"], level: "Middle", hint: "Lift the right ring finger; keep the other five main keys closed." },
  { id: "f4", note: "F", octave: 4, midi: 65, keys: ["lh1", "lh2", "lh3", "rh1"], level: "Middle", hint: "Left hand down, plus the right index finger." },
  { id: "fs4", note: "F♯", octave: 4, midi: 66, keys: ["lh1", "lh2", "lh3", "rh2"], level: "Middle", hint: "Left hand down, plus the right middle finger." },
  { id: "g4", note: "G", octave: 4, midi: 67, keys: ["lh1", "lh2", "lh3"], level: "Middle", hint: "Only the three left-hand main keys." },
  { id: "gs4", note: "A♭", octave: 4, midi: 68, keys: ["lh1", "lh2", "lh3", "gsharp"], level: "Middle", hint: "Finger G and add the left-pinky G♯ key." },
  { id: "a4", note: "A", octave: 4, midi: 69, keys: ["lh1", "lh2"], level: "Middle", hint: "Left index and middle fingers. Keep the ring finger hovering close." },
  { id: "bb4", note: "B♭", octave: 4, midi: 70, keys: ["lh1", "bis"], level: "Middle", hint: "Use the left index to cover B and the small bis key together." },
  { id: "b4", note: "B", octave: 4, midi: 71, keys: ["lh1"], level: "Middle", hint: "Left index finger only." },
  { id: "c5", note: "C", octave: 5, midi: 72, keys: ["lh2"], level: "Middle", hint: "Left middle finger only; the index finger floats above B." },
  { id: "cs5", note: "C♯", octave: 5, midi: 73, keys: [], level: "Middle", hint: "Open fingering. Keep every finger curved and close to its key." },
  { id: "d5", note: "D", octave: 5, midi: 74, keys: oct(baseSix), level: "Upper", hint: "Six main fingers plus the left-thumb octave key." },
  { id: "eb5", note: "E♭", octave: 5, midi: 75, keys: oct([...baseSix, "lowEb"]), level: "Upper", hint: "Upper D fingering plus the right-pinky E♭ key." },
  { id: "e5", note: "E", octave: 5, midi: 76, keys: oct(["lh1", "lh2", "lh3", "rh1", "rh2"]), level: "Upper", hint: "Octave key with the five main fingers used for middle E." },
  { id: "f5", note: "F", octave: 5, midi: 77, keys: oct(["lh1", "lh2", "lh3", "rh1"]), level: "Upper", hint: "Octave key, left hand down, right index." },
  { id: "fs5", note: "F♯", octave: 5, midi: 78, keys: oct(["lh1", "lh2", "lh3", "rh2"]), level: "Upper", hint: "Octave key, left hand down, right middle." },
  { id: "g5", note: "G", octave: 5, midi: 79, keys: oct(["lh1", "lh2", "lh3"]), level: "Upper", hint: "Octave key plus the three left-hand main keys." },
  { id: "gs5", note: "A♭", octave: 5, midi: 80, keys: oct(["lh1", "lh2", "lh3", "gsharp"]), level: "Upper", hint: "Upper G with the left-pinky G♯ key." },
  { id: "a5", note: "A", octave: 5, midi: 81, keys: oct(["lh1", "lh2"]), level: "Upper", hint: "Octave key with left index and middle fingers." },
  { id: "bb5", note: "B♭", octave: 5, midi: 82, keys: oct(["lh1", "bis"]), level: "Upper", hint: "Octave key with the B and bis keys under the left index." },
  { id: "b5", note: "B", octave: 5, midi: 83, keys: oct(["lh1"]), level: "Upper", hint: "Octave key and left index finger." },
  { id: "c6", note: "C", octave: 6, midi: 84, keys: oct(["lh2"]), level: "Upper", hint: "Octave key and left middle finger." },
  { id: "cs6", note: "C♯", octave: 6, midi: 85, keys: ["octave"], level: "Upper", hint: "Octave key only; keep the main stack open and relaxed." },
  { id: "d6", note: "D", octave: 6, midi: 86, keys: ["octave", "palmD"], level: "Upper", hint: "Octave key plus the first left-hand palm key." },
  { id: "eb6", note: "E♭", octave: 6, midi: 87, keys: ["octave", "palmD", "palmEb"], level: "Upper", hint: "Octave key plus the first two left-hand palm keys." },
  { id: "e6", note: "E", octave: 6, midi: 88, keys: ["octave", "palmD", "palmEb", "sideE"], level: "Upper", hint: "Octave and D/E♭ palm keys, then add the upper right-hand side key." },
  { id: "f6", note: "F", octave: 6, midi: 89, keys: ["octave", "palmD", "palmEb", "palmF"], level: "Upper", hint: "Octave key with all three left-hand palm keys." },
];

export function writtenToConcert(midi: number) {
  return midi - 9;
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export function midiToName(midi: number) {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
