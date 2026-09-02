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
  | "altFsharp"
  | "highFsharp"
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

/**
 * A data-honesty flag, not a musical one. `"unverified"` marks a fingering
 * this file has not had checked by a teacher -- currently every altissimo
 * entry and every alternate added alongside them. Its absence does not
 * itself claim teacher sign-off either; see the top-of-file note and
 * SaxFingeringLab's truth card for what "checked" does and doesn't mean here.
 */
export type ReviewStatus = "unverified";

export type Fingering = {
  id: string;
  note: string;
  octave: number;
  midi: number;
  keys: SaxKeyId[];
  level: "Low" | "Middle" | "Upper" | "Altissimo";
  hint: string;
  primaryLabel?: string;
  alternates?: FingeringOption[];
  /** See {@link ReviewStatus}. */
  review?: ReviewStatus;
  /**
   * A small number of adjacent-note trill fingerings. `keys` lists only the
   * touch-pieces that change between `from` and `to` -- the ones a player
   * actually alternates -- not the full fingering for either note.
   */
  trills?: TrillOption[];
};

export type FingeringOption = {
  id: string;
  label: string;
  keys: SaxKeyId[];
  hint: string;
  useWhen: string;
  /** See {@link ReviewStatus}. */
  review?: ReviewStatus;
};

export type TrillOption = {
  /** Fingering id this trill starts from (its own entry carries the array). */
  from: string;
  /** Fingering id this trill moves to. */
  to: string;
  /** The touch-piece(s) alternated to produce the trill; the rest of the base fingering stays held. */
  keys: SaxKeyId[];
  hint: string;
  /** See {@link ReviewStatus}. */
  review?: ReviewStatus;
};

export type SaxMechanic = {
  cupMotion: "closes" | "opens";
  linkedPads: Array<{
    name: string;
    motion: "closes" | "opens";
    condition?: string;
  }>;
  coupledCupIds?: SaxKeyId[];
  explanation: string;
};

export const SAX_KEYS: SaxKey[] = [
  { id: "octave", short: "Oct", name: "Octave lever", hand: "Left", finger: "Thumb", position: [-0.16, 1.82, -0.43], side: "back" },
  { id: "frontF", short: "F↑", name: "Front F touch", hand: "Left", finger: "Index", position: [-0.27, 2.4, 0.4], side: "left" },
  { id: "lh1", short: "1", name: "B pearl", hand: "Left", finger: "Index", position: [-0.19, 2.08, 0.45] },
  { id: "bis", short: "Bis", name: "Bis B♭ pearl", hand: "Left", finger: "Index edge", position: [0.15, 1.82, 0.46], side: "right" },
  { id: "lh2", short: "2", name: "A pearl", hand: "Left", finger: "Middle", position: [-0.18, 1.47, 0.47] },
  { id: "lh3", short: "3", name: "G pearl", hand: "Left", finger: "Ring", position: [-0.16, 0.84, 0.48] },
  { id: "palmD", short: "D", name: "High D palm touch", hand: "Left", finger: "Palm", position: [-0.48, 2.18, 0.07], side: "left" },
  { id: "palmEb", short: "E♭", name: "High E♭ palm touch", hand: "Left", finger: "Palm", position: [-0.53, 1.68, 0.06], side: "left" },
  { id: "palmF", short: "F", name: "High F palm touch", hand: "Left", finger: "Palm", position: [-0.54, 1.18, 0.05], side: "left" },
  { id: "gsharp", short: "G♯", name: "G♯ touch", hand: "Left", finger: "Pinky", position: [-0.56, 0.42, 0.24], side: "left" },
  { id: "lowCsharp", short: "C♯", name: "Low C♯ roller", hand: "Left", finger: "Pinky", position: [-0.64, 0.12, 0.2], side: "left" },
  { id: "lowB", short: "B", name: "Low B roller", hand: "Left", finger: "Pinky", position: [-0.66, -0.2, 0.17], side: "left" },
  { id: "lowBb", short: "B♭", name: "Low B♭ touch", hand: "Left", finger: "Pinky", position: [-0.61, -0.52, 0.13], side: "left" },
  { id: "rh1", short: "1", name: "F pearl", hand: "Right", finger: "Index", position: [0.2, 0.18, 0.48] },
  { id: "rh2", short: "2", name: "E pearl", hand: "Right", finger: "Middle", position: [0.2, -0.46, 0.49] },
  { id: "rh3", short: "3", name: "D pearl", hand: "Right", finger: "Ring", position: [0.2, -1.09, 0.5] },
  { id: "sideC", short: "C", name: "Side C touch", hand: "Right", finger: "Index side", position: [0.57, 0.48, 0.2], side: "right" },
  { id: "sideBb", short: "B♭", name: "Side B♭ touch", hand: "Right", finger: "Index side", position: [0.59, 0.04, 0.18], side: "right" },
  { id: "highFsharp", short: "F♯↑", name: "High F♯ touch", hand: "Right", finger: "Middle-side reach", position: [0.61, -0.66, 0.15], side: "right" },
  { id: "altFsharp", short: "F♯", name: "Alternate / fork F♯ touch", hand: "Right", finger: "Ring-side reach", position: [0.57, -1.29, 0.16], side: "right" },
  { id: "sideE", short: "E↑", name: "High E side touch", hand: "Right", finger: "Index side", position: [0.54, 0.91, 0.16], side: "right" },
  { id: "lowC", short: "C", name: "Low C roller", hand: "Right", finger: "Pinky", position: [0.57, -1.42, 0.23], side: "right" },
  { id: "lowEb", short: "E♭", name: "Low E♭ roller", hand: "Right", finger: "Pinky", position: [0.6, -1.74, 0.18], side: "right" },
];

// This is a pedagogical input-to-output map. The coloured touch is where the
// finger acts; linked pad movement remains a separate mechanical consequence.
export const SAX_MECHANICS: Record<SaxKeyId, SaxMechanic> = {
  octave: {
    cupMotion: "opens",
    linkedPads: [
      { name: "Neck octave vent", motion: "opens", condition: "A and above" },
      { name: "Body octave vent", motion: "opens", condition: "G♯ and below" },
    ],
    explanation: "The thumb lever drives an automatic rocker. The fingering selects which of the two octave vents opens; the player still presses one lever.",
  },
  frontF: {
    cupMotion: "opens",
    linkedPads: [
      { name: "Front F vent", motion: "opens" },
      { name: "B tone-hole pad", motion: "closes" },
    ],
    coupledCupIds: ["lh1"],
    explanation: "The front F touch vents the upper tube while its linkage also brings the B pad into the required state. The B pearl is not a second fingertip target.",
  },
  lh1: { cupMotion: "closes", linkedPads: [{ name: "B tone-hole pad", motion: "closes" }], explanation: "The left index pearl closes the B pad." },
  bis: { cupMotion: "closes", linkedPads: [{ name: "Bis B♭ pad", motion: "closes" }], explanation: "The index finger rolls onto the small bis pearl to close the auxiliary B♭ pad." },
  lh2: { cupMotion: "closes", linkedPads: [{ name: "A tone-hole pad", motion: "closes" }], explanation: "The left middle-finger pearl closes the A pad." },
  lh3: { cupMotion: "closes", linkedPads: [{ name: "G tone-hole pad", motion: "closes" }], explanation: "The left ring-finger pearl closes the G pad and participates in the automatic octave changeover." },
  palmD: { cupMotion: "opens", linkedPads: [{ name: "High D vent pad", motion: "opens" }], explanation: "The first left-palm touch opens the high D vent." },
  palmEb: { cupMotion: "opens", linkedPads: [{ name: "High E♭ vent pad", motion: "opens" }], explanation: "The second left-palm touch opens the high E♭ vent." },
  palmF: { cupMotion: "opens", linkedPads: [{ name: "High F vent pad", motion: "opens" }], explanation: "The upper left-palm touch opens the high F vent." },
  gsharp: { cupMotion: "opens", linkedPads: [{ name: "Normally closed G♯ pad", motion: "opens" }], explanation: "The left-pinky touch opens the normally closed G♯ pad." },
  lowCsharp: { cupMotion: "opens", linkedPads: [{ name: "Normally closed low C♯ pad", motion: "opens" }], explanation: "The left-pinky C♯ touch opens the normally closed low C♯ pad; its table is mechanically linked to the low-note cluster." },
  lowB: {
    cupMotion: "closes",
    linkedPads: [
      { name: "Low C pad", motion: "closes" },
      { name: "Low B bell pad", motion: "closes" },
    ],
    coupledCupIds: ["lowC"],
    explanation: "The left-pinky low-B table closes both the low-C pad and the low-B bell pad through the long lower-stack linkage.",
  },
  lowBb: {
    cupMotion: "closes",
    linkedPads: [
      { name: "Low C pad", motion: "closes" },
      { name: "Low B bell pad", motion: "closes" },
      { name: "Low B♭ bell pad", motion: "closes" },
    ],
    coupledCupIds: ["lowC", "lowB"],
    explanation: "The outer left-pinky touch carries the lower stack with it: low C, low B and the large low B♭ bell pad all close.",
  },
  rh1: { cupMotion: "closes", linkedPads: [{ name: "F tone-hole pad", motion: "closes" }], explanation: "The right index pearl closes the F pad." },
  rh2: { cupMotion: "closes", linkedPads: [{ name: "E tone-hole pad", motion: "closes" }], explanation: "The right middle-finger pearl closes the E pad." },
  rh3: { cupMotion: "closes", linkedPads: [{ name: "D tone-hole pad", motion: "closes" }], explanation: "The right ring-finger pearl closes the D pad." },
  sideC: { cupMotion: "opens", linkedPads: [{ name: "Side C vent pad", motion: "opens" }], explanation: "The right index side touch opens the auxiliary C vent for the side-C fingering or trill." },
  sideBb: { cupMotion: "opens", linkedPads: [{ name: "Side B♭ vent pad", motion: "opens" }], explanation: "The right index side touch opens the auxiliary B♭ vent." },
  altFsharp: { cupMotion: "opens", linkedPads: [{ name: "Alternate / fork F♯ vent pad", motion: "opens" }], explanation: "This lower side touch opens the alternate F♯ vent. It is used with the right-index F pearl; it is not the separate high-F♯ key." },
  highFsharp: { cupMotion: "opens", linkedPads: [{ name: "High F♯ vent pad", motion: "opens" }], explanation: "The keyed high-F♯ touch opens its dedicated vent. It is a different control from the alternate first/second-octave F♯ touch." },
  sideE: { cupMotion: "opens", linkedPads: [{ name: "High E vent pad", motion: "opens" }], explanation: "The upper right-hand side touch opens the high-E vent used in the palm E, F and F♯ routes." },
  lowC: { cupMotion: "closes", linkedPads: [{ name: "Low C pad", motion: "closes" }], explanation: "The right-pinky touch closes the low C pad." },
  lowEb: { cupMotion: "opens", linkedPads: [{ name: "Normally closed low E♭ pad", motion: "opens" }], explanation: "The right-pinky E♭ touch opens its normally closed vent, raising low D by a semitone." },
};

const baseSix: SaxKeyId[] = ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3"];
const oct = (keys: SaxKeyId[]) => ["octave", ...keys] as SaxKeyId[];

/**
 * Written fingerings for the modern saxophone. Soprano, alto, tenor and
 * baritone share one fingering system -- a written C is the same grip on
 * every horn, only the sounding pitch differs (see `writtenOffset` in
 * `instruments.ts`). So this map, despite its name's history, is not
 * alto-specific: it is keyed on written pitch and applies across the family.
 *
 * Two real gaps remain: it has no entry for baritone's low A (written A3), a
 * key many baritones have that the other three saxes lack; and while the
 * standard written range (B♭3 through F♯6) is teacher-checked, the altissimo
 * entries appended after it (G6 through C7) are not -- see the `review`
 * field and the block comment above the altissimo section below.
 */
export const SAXOPHONE_FINGERINGS: Fingering[] = [
  { id: "bb3", note: "B♭", octave: 3, midi: 58, keys: [...baseSix, "lowBb"], level: "Low", hint: "All six main fingers, then roll the left pinky to low B♭." },
  { id: "b3", note: "B", octave: 3, midi: 59, keys: [...baseSix, "lowB"], level: "Low", hint: "All six main fingers with the left-pinky low B key." },
  {
    id: "c4", note: "C", octave: 4, midi: 60, keys: [...baseSix, "lowC"], level: "Low",
    hint: "All six main fingers with the right-pinky low C key.",
    trills: [{
      from: "c4", to: "d4", keys: ["lowC"],
      hint: "Keep all six main pearls down and trill by tapping the right-pinky low C key on and off.",
      review: "unverified",
    }],
  },
  { id: "cs4", note: "C♯", octave: 4, midi: 61, keys: [...baseSix, "lowCsharp"], level: "Low", hint: "All six main fingers with the left-pinky low C♯ key." },
  { id: "d4", note: "D", octave: 4, midi: 62, keys: baseSix, level: "Low", hint: "Close the six main pearl keys. Keep both pinkies relaxed." },
  { id: "eb4", note: "E♭", octave: 4, midi: 63, keys: [...baseSix, "lowEb"], level: "Low", hint: "Six main keys plus the right-pinky E♭ key." },
  { id: "e4", note: "E", octave: 4, midi: 64, keys: ["lh1", "lh2", "lh3", "rh1", "rh2"], level: "Middle", hint: "Lift the right ring finger; keep the other five main keys closed." },
  {
    id: "f4", note: "F", octave: 4, midi: 65, keys: ["lh1", "lh2", "lh3", "rh1"], level: "Middle",
    hint: "Left hand down, plus the right index finger.",
    trills: [{
      from: "f4", to: "g4", keys: ["rh1"],
      hint: "Keep the left-hand stack (B, A, G) down and trill by lifting and dropping the right index F pearl.",
      review: "unverified",
    }],
  },
  {
    id: "fs4", note: "F♯", octave: 4, midi: 66,
    keys: ["lh1", "lh2", "lh3", "rh2"], level: "Middle", primaryLabel: "Regular F♯",
    hint: "Left hand down, plus the right middle finger.",
    alternates: [{
      id: "fork-fs4", label: "Alternate / fork F♯", keys: ["lh1", "lh2", "lh3", "rh1", "altFsharp"],
      hint: "Keep the left-hand stack and right-index F pearl down, then add the separate alternate F♯ touch.",
      useWhen: "Useful for F–F♯ trills and some chromatic passages; check pitch and feel on your own instrument.",
    }],
  },
  { id: "g4", note: "G", octave: 4, midi: 67, keys: ["lh1", "lh2", "lh3"], level: "Middle", hint: "Only the three left-hand main keys." },
  { id: "gs4", note: "A♭", octave: 4, midi: 68, keys: ["lh1", "lh2", "lh3", "gsharp"], level: "Middle", hint: "Finger G and add the left-pinky G♯ key." },
  { id: "a4", note: "A", octave: 4, midi: 69, keys: ["lh1", "lh2"], level: "Middle", hint: "Left index and middle fingers. Keep the ring finger hovering close." },
  {
    id: "bb4", note: "B♭", octave: 4, midi: 70,
    keys: ["lh1", "bis"], level: "Middle", primaryLabel: "Bis B♭",
    hint: "Use the left index to cover B and the small bis key together.",
    alternates: [
      {
        id: "side-bb4", label: "Side B♭", keys: ["lh1", "sideBb"],
        hint: "Hold the B pearl with the left index and open the side B♭ vent with the right index side.",
        useWhen: "Often cleaner beside B natural or in B–B♭ trills; bis is usually the default for scale passages.",
      },
      {
        id: "long-bb4", label: "Long B♭ (1+1)", keys: ["lh1", "rh1"],
        hint: "Hold the B pearl with the left index and add the right index F pearl instead of bis or side.",
        useWhen: "Published as a third option, sometimes used approaching from low F or in specific chromatic runs; bis is still the usual default.",
        review: "unverified",
      },
    ],
  },
  {
    id: "b4", note: "B", octave: 4, midi: 71, keys: ["lh1"], level: "Middle",
    hint: "Left index finger only.",
    trills: [{
      from: "b4", to: "c5", keys: ["sideC"],
      hint: "Hold the B fingering with the left index down and trill by tapping the side C key with the right index side.",
      review: "unverified",
    }],
  },
  {
    id: "c5", note: "C", octave: 5, midi: 72,
    keys: ["lh2"], level: "Middle", primaryLabel: "Regular C",
    hint: "Left middle finger only; the index finger floats above B.",
    alternates: [{
      id: "side-c5", label: "Side C", keys: ["lh1", "sideC"],
      hint: "Hold B with the left index and open the side C vent with the right index side.",
      useWhen: "Useful for B–C trills and for matching colour or intonation in slower passages.",
    }],
  },
  { id: "cs5", note: "C♯", octave: 5, midi: 73, keys: [], level: "Middle", hint: "Open fingering. Keep every finger curved and close to its key." },
  { id: "d5", note: "D", octave: 5, midi: 74, keys: oct(baseSix), level: "Upper", hint: "Six main fingers plus the left-thumb octave key." },
  { id: "eb5", note: "E♭", octave: 5, midi: 75, keys: oct([...baseSix, "lowEb"]), level: "Upper", hint: "Upper D fingering plus the right-pinky E♭ key." },
  { id: "e5", note: "E", octave: 5, midi: 76, keys: oct(["lh1", "lh2", "lh3", "rh1", "rh2"]), level: "Upper", hint: "Octave key with the five main fingers used for middle E." },
  { id: "f5", note: "F", octave: 5, midi: 77, keys: oct(["lh1", "lh2", "lh3", "rh1"]), level: "Upper", hint: "Octave key, left hand down, right index." },
  {
    id: "fs5", note: "F♯", octave: 5, midi: 78,
    keys: oct(["lh1", "lh2", "lh3", "rh2"]), level: "Upper", primaryLabel: "Regular F♯",
    hint: "Octave key, left hand down, right middle.",
    alternates: [{
      id: "fork-fs5", label: "Alternate / fork F♯", keys: oct(["lh1", "lh2", "lh3", "rh1", "altFsharp"]),
      hint: "Keep the octave, left-hand stack and right-index F pearl down, then add the alternate F♯ touch.",
      useWhen: "Useful for F–F♯ trills and selected chromatic connections.",
    }],
  },
  { id: "g5", note: "G", octave: 5, midi: 79, keys: oct(["lh1", "lh2", "lh3"]), level: "Upper", hint: "Octave key plus the three left-hand main keys." },
  { id: "gs5", note: "A♭", octave: 5, midi: 80, keys: oct(["lh1", "lh2", "lh3", "gsharp"]), level: "Upper", hint: "Upper G with the left-pinky G♯ key." },
  { id: "a5", note: "A", octave: 5, midi: 81, keys: oct(["lh1", "lh2"]), level: "Upper", hint: "Octave key with left index and middle fingers." },
  {
    id: "bb5", note: "B♭", octave: 5, midi: 82,
    keys: oct(["lh1", "bis"]), level: "Upper", primaryLabel: "Bis B♭",
    hint: "Octave key with the B and bis keys under the left index.",
    alternates: [
      {
        id: "side-bb5", label: "Side B♭", keys: oct(["lh1", "sideBb"]),
        hint: "Add the octave lever to the B-plus-side-B♭ fingering.",
        useWhen: "Often cleaner beside upper B natural or for a B–B♭ trill.",
      },
      {
        id: "long-bb5", label: "Long B♭ (1+1)", keys: oct(["lh1", "rh1"]),
        hint: "Add the octave lever to the B-plus-right-index (long B♭) fingering.",
        useWhen: "Published as a third option; bis is still the usual default for scale passages.",
        review: "unverified",
      },
    ],
  },
  { id: "b5", note: "B", octave: 5, midi: 83, keys: oct(["lh1"]), level: "Upper", hint: "Octave key and left index finger." },
  {
    id: "c6", note: "C", octave: 6, midi: 84,
    keys: oct(["lh2"]), level: "Upper", primaryLabel: "Regular C",
    hint: "Octave key and left middle finger.",
    alternates: [{
      id: "side-c6", label: "Side C", keys: oct(["lh1", "sideC"]),
      hint: "Hold the octave and B controls, then open the side C vent.",
      useWhen: "Useful for B–C trills and selected colour or intonation choices.",
    }],
  },
  { id: "cs6", note: "C♯", octave: 6, midi: 85, keys: ["octave"], level: "Upper", hint: "Octave key only; keep the main stack open and relaxed." },
  { id: "d6", note: "D", octave: 6, midi: 86, keys: ["octave", "palmD"], level: "Upper", hint: "Octave key plus the first left-hand palm key." },
  { id: "eb6", note: "E♭", octave: 6, midi: 87, keys: ["octave", "palmD", "palmEb"], level: "Upper", hint: "Octave key plus the first two left-hand palm keys." },
  {
    id: "e6", note: "E", octave: 6, midi: 88,
    keys: ["octave", "palmD", "palmEb", "sideE"], level: "Upper", primaryLabel: "Palm E",
    hint: "Octave and D/E♭ palm keys, then add the upper right-hand side key.",
    alternates: [{
      id: "front-e6", label: "Front E", keys: ["octave", "frontF", "lh2", "lh3"],
      hint: "Press octave, front F, A and G touch-pieces. The front-F linkage supplies the B-pad state without a fingertip on the B pearl.",
      useWhen: "A useful bridge from A or C into the upper register and toward altissimo; voicing and intonation need practice.",
    }],
  },
  {
    id: "f6", note: "F", octave: 6, midi: 89,
    keys: ["octave", "palmD", "palmEb", "palmF", "sideE"], level: "Upper", primaryLabel: "Palm F",
    hint: "Octave, all three left-hand palm keys and the upper right-hand E side touch.",
    alternates: [{
      id: "front-f6", label: "Front F", keys: ["octave", "frontF", "lh2"],
      hint: "Press octave, front F and the A pearl. The front-F linkage closes the required B pad automatically.",
      useWhen: "Useful for leaps and as a bridge to front-fingering altissimo; expect a different colour from palm F.",
    }],
  },
  {
    id: "fs6", note: "F♯", octave: 6, midi: 90,
    keys: ["octave", "frontF", "lh2", "highFsharp"], level: "Upper", primaryLabel: "Front F + high F♯",
    hint: "Build front F with the A pearl, then add the separate keyed high-F♯ touch.",
    alternates: [{
      id: "palm-fs6", label: "Palm route", keys: ["octave", "palmD", "palmEb", "palmF", "sideE", "highFsharp"],
      hint: "Use the complete palm-F fingering, including the upper E side touch, and add the keyed high-F♯ touch.",
      useWhen: "Useful when approaching from palm D, E♭, E or F; compare response and pitch with the front route.",
    }],
  },

  /**
   * Altissimo (written G6 through C7). Altissimo is fundamentally different
   * from everything above: every fingering here shifts with the horn,
   * mouthpiece, reed and player, and published charts routinely disagree on
   * the "best" option for a given note. So, unlike the rest of this file:
   *   - every entry carries level: "Altissimo", which SaxFingeringLab keeps
   *     out of Challenge mode's default question pool (see SaxophoneLab.tsx);
   *   - each note lists 2-3 widely published options rather than one
   *     "correct" answer, because no single fingering is right for every
   *     setup;
   *   - every entry and alternate here carries review: "unverified" --
   *     nobody who teaches saxophone has checked these for Bocal, which the
   *     lab surfaces as a badge next to the fingering.
   *
   * Sources cross-checked for every fingering below (both consulted 2026-09-02):
   *   1. The Woodwind Fingering Guide's "Lower Altissimo" (F#6-A6) and
   *      "Middle Altissimo" (Bb6-C#7) charts:
   *      https://www.wfg.woodwind.org/sax/sax_alt_4.html
   *      https://www.wfg.woodwind.org/sax/sax_alt_5.html
   *      An aggregator of fingerings drawn from published altissimo methods
   *      (Rascher- and Rousseau-style), some entries annotated by which
   *      saxophone they suit best -- those annotations are kept in `useWhen`
   *      below where they exist (e.g. "for alto", "for tenor").
   *   2. The front-F and palm-key "overtone" fingering families used as the
   *      standard entry-level teaching approach to altissimo, as described
   *      in method-literature summaries at saxteacheruk.com and bettersax.com
   *      (both consulted the same date).
   * Every option below appears in source (1) and matches the general
   * fingering family described in source (2); options that could not be
   * cross-checked this way were left out rather than guessed. None of the
   * key combinations below duplicate a standard-range fingering above --
   * two different notes sharing one exact key combination would break the
   * lab's key-to-note matching in Learn mode.
   */
  {
    id: "g6", note: "G", octave: 6, midi: 91, level: "Altissimo", review: "unverified",
    keys: ["octave", "frontF"], primaryLabel: "Front F",
    hint: "Octave key and the front F touch alone -- the simplest published starting point for altissimo G.",
    alternates: [
      {
        id: "g6-frontF-f", label: "Front F + right F", keys: ["octave", "frontF", "rh1"],
        hint: "Add the right index F pearl to the front-F fingering for a steadier core.",
        useWhen: "A common addition when the plain front-F version feels thin or hard to center.",
        review: "unverified",
      },
      {
        id: "g6-frontF-sideBb", label: "Front F + side B♭", keys: ["octave", "frontF", "sideBb"],
        hint: "Add the side B♭ vent to the front-F fingering.",
        useWhen: "A published pitch/response adjustment; try it if the plain front-F version is flat or unstable.",
        review: "unverified",
      },
    ],
  },
  {
    id: "gs6", note: "A♭", octave: 6, midi: 92, level: "Altissimo", review: "unverified",
    keys: ["octave", "lh1", "lh3"], primaryLabel: "Cross fingering",
    hint: "Octave key with the left index and ring finger, middle finger lifted -- a cross-fingering rather than a palm or front-F route.",
    alternates: [
      {
        id: "gs6-frontF-sideE", label: "Front F + side E", keys: ["octave", "frontF", "sideE"],
        hint: "Front F touch plus the upper right-hand side E key.",
        useWhen: "A front-F-family option for players already using front F through this part of the range.",
        review: "unverified",
      },
      {
        id: "gs6-cross-sideC", label: "Left cross + side C + F", keys: ["octave", "lh1", "sideC", "rh1"],
        hint: "Left index and right index F pearl down, plus the side C vent open.",
        useWhen: "An alternative when the plain cross fingering is unstable; adds venting from the side C key.",
        review: "unverified",
      },
    ],
  },
  {
    id: "a6", note: "A", octave: 6, midi: 93, level: "Altissimo", review: "unverified",
    keys: ["octave", "lh2", "lh3"], primaryLabel: "Core altissimo A",
    hint: "Octave key with the left middle and ring fingers only.",
    alternates: [
      {
        id: "a6-sideC", label: "+ side C", keys: ["octave", "lh2", "lh3", "sideC"],
        hint: "Add the side C vent to the core A6 fingering.",
        useWhen: "A published stabilizing addition; try it if the plain fingering is unfocused.",
        review: "unverified",
      },
      {
        id: "a6-gsharp", label: "+ G♯", keys: ["octave", "lh2", "lh3", "gsharp"],
        hint: "Add the left-pinky G♯ key to the core A6 fingering.",
        useWhen: "Published for baritone specifically, but worth trying as a general option on any horn.",
        review: "unverified",
      },
    ],
  },
  {
    id: "bb6", note: "B♭", octave: 6, midi: 94, level: "Altissimo", review: "unverified",
    keys: ["octave", "lh3", "sideC"], primaryLabel: "Ring finger + side C",
    hint: "Octave key, left ring finger, and the side C vent.",
    alternates: [
      {
        id: "bb6-palmD", label: "Palm D + ring stack", keys: ["octave", "palmD", "lh2", "lh3"],
        hint: "Palm D key with the left middle and ring fingers, no right hand.",
        useWhen: "Published as working on alto and tenor with no right-hand fingers.",
        review: "unverified",
      },
      {
        id: "bb6-ring-f", label: "Ring stack + F", keys: ["octave", "lh2", "lh3", "rh1"],
        hint: "Left middle and ring fingers plus the right index F pearl.",
        useWhen: "An alternative when the side-C version does not speak cleanly.",
        review: "unverified",
      },
    ],
  },
  {
    id: "b6", note: "B", octave: 6, midi: 95, level: "Altissimo", review: "unverified",
    keys: ["octave", "palmD", "rh1", "rh2"], primaryLabel: "Palm D + right hand",
    hint: "Palm D key with the right index and middle fingers.",
    alternates: [
      {
        id: "b6-alto-f", label: "Right F only (alto)", keys: ["octave", "rh1"],
        hint: "Octave key and the right index F pearl alone.",
        useWhen: "Published specifically for alto saxophone; may not speak the same way on tenor or baritone.",
        review: "unverified",
      },
      {
        id: "b6-tenor-full", label: "Full right hand + side C (tenor)", keys: ["octave", "rh1", "rh2", "rh3", "sideC"],
        hint: "All three right-hand fingers plus the side C vent, no left hand.",
        useWhen: "Published specifically as speaking more easily on tenor.",
        review: "unverified",
      },
    ],
  },
  {
    id: "c7", note: "C", octave: 7, midi: 96, level: "Altissimo", review: "unverified",
    keys: ["octave", "palmD", "palmEb", "sideC"], primaryLabel: "Palm D/E♭ + side C",
    hint: "Palm D and E♭ keys with the side C vent.",
    alternates: [
      {
        id: "c7-full-palm", label: "Full palm stack + ring finger", keys: ["octave", "palmD", "palmEb", "palmF", "lh3"],
        hint: "All three left-hand palm keys plus the left ring finger, no right hand.",
        useWhen: "Published as an alternative that avoids right-hand keys entirely.",
        review: "unverified",
      },
      {
        id: "c7-sideC-sideBb", label: "Palm D/E♭ + side C/B♭", keys: ["octave", "palmD", "palmEb", "sideC", "sideBb"],
        hint: "Palm D and E♭ keys with both the side C and side B♭ vents open.",
        useWhen: "Extra venting some players add for stability at the top of this chart.",
        review: "unverified",
      },
    ],
  },
];

/** Back-compat name; new code should import {@link SAXOPHONE_FINGERINGS}. */
export const ALTO_FINGERINGS = SAXOPHONE_FINGERINGS;

/**
 * Concert (sounding) MIDI note for a written MIDI note, given the
 * instrument's `writtenOffset` (semitones from sounding to written pitch --
 * see `instruments.ts`). This used to be hardcoded to the alto's offset of
 * 9; every caller must now pass the offset for the instrument actually
 * being displayed.
 */
export function writtenToConcert(midi: number, writtenOffset: number) {
  return midi - writtenOffset;
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export function midiToName(midi: number) {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
