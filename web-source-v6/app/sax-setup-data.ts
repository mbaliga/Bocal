export type SaxColorway = {
  id: string;
  name: string;
  description: string;
  body: number;
  bodyHighlight: number;
  keywork: number;
  keyworkLight: number;
  keyworkDark: number;
  pearl: number;
  iridescence?: number;
  iridescenceIOR?: number;
  roughness?: number;
};

export type ToneProfile = {
  brightness: number;
  response: number;
  projection: number;
  resistance: number;
};

export type SetupAttribute = {
  label: string;
  low: string;
  high: string;
  value: number;
};

export type SetupVariant = {
  id: string;
  name: string;
  eyebrow: string;
  summary: string;
  useCase: string;
  facts?: string[];
  attributes: SetupAttribute[];
  tone: ToneProfile;
  evidence: "Manufacturer description" | "Educational archetype";
  sourceLabel: string;
  sourceUrl: string;
};

export type SetupPartId = "finish" | "neck" | "mouthpiece" | "reed" | "ligature";

export type SetupPart = {
  id: SetupPartId;
  label: string;
  shortDescription: string;
  explainer: string;
  caveat: string;
  variants: SetupVariant[];
};

export const SAX_COLORWAYS: SaxColorway[] = [
  {
    id: "noir-gold",
    name: "Noir & gold",
    description: "Black lacquer body with warm gold keywork — Bocal’s high-contrast teaching default.",
    body: 0x050506,
    bodyHighlight: 0x292315,
    keywork: 0xc8922f,
    keyworkLight: 0xf1c65c,
    keyworkDark: 0x684611,
    pearl: 0xf2eddf,
    roughness: 0.17,
  },
  {
    id: "classic-gold",
    name: "Classic gold",
    description: "Traditional gold lacquer body and keywork.",
    body: 0xb47d20,
    bodyHighlight: 0xe0b64f,
    keywork: 0xc28c28,
    keyworkLight: 0xf0c45b,
    keyworkDark: 0x684611,
    pearl: 0xf0eadb,
    roughness: 0.2,
  },
  {
    id: "gold-silver",
    name: "Gold & silver",
    description: "Gold lacquer body with silver-coloured keywork for a crisp mechanical read.",
    body: 0xb47d20,
    bodyHighlight: 0xe0b64f,
    keywork: 0xbec4c9,
    keyworkLight: 0xf0f3f4,
    keyworkDark: 0x545b61,
    pearl: 0xf4f0e7,
    roughness: 0.15,
  },
  {
    id: "rose-gold",
    name: "Rose & gold",
    description: "Saturated rose body with classic gold keywork.",
    body: 0x9f145c,
    bodyHighlight: 0xf154a1,
    keywork: 0xc8922f,
    keyworkLight: 0xf1c65c,
    keyworkDark: 0x684611,
    pearl: 0xf2eddf,
    roughness: 0.18,
  },
  {
    id: "prism-gold",
    name: "Prism & gold",
    description: "Iridescent violet-teal body with gold keywork.",
    body: 0x37206d,
    bodyHighlight: 0x10b7bb,
    keywork: 0xc8922f,
    keyworkLight: 0xf1c65c,
    keyworkDark: 0x684611,
    pearl: 0xe8f4ee,
    iridescence: 1,
    iridescenceIOR: 1.72,
    roughness: 0.13,
  },
  {
    id: "black-silver",
    name: "Black & silver",
    description: "Black lacquer body with cool silver-coloured keywork.",
    body: 0x050506,
    bodyHighlight: 0x22262a,
    keywork: 0xbec4c9,
    keyworkLight: 0xf0f3f4,
    keyworkDark: 0x545b61,
    pearl: 0xf4f0e7,
    roughness: 0.17,
  },
];

const YAMAHA_NECK_SOURCE = "https://usa.yamaha.com/products/musical_instruments/winds/saxophones/alto_saxophone_neck/index.html";
const YAMAHA_MOUTHPIECE_SOURCE = "https://usa.yamaha.com/products/musical_instruments/winds/mouthpieces/saxophones/custom_standard.html";
const YAMAHA_SELECTION_SOURCE = "https://www.yamaha.com/en/musical_instrument_guide/saxophone/selection/selection002.html";
const YAMAHA_REED_SOURCE = "https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/mechanism002.html";

export const SAX_SETUP_PARTS: SetupPart[] = [
  {
    id: "finish",
    label: "Finish",
    shortDescription: "Appearance, contrast and care",
    explainer: "Finish changes how the instrument looks and how easily its mechanics can be read. Bocal does not assign a tone score to colour.",
    caveat: "Treat colourway as visual preference. Geometry, setup, reed, mouthpiece and the player have much clearer educational consequences than lacquer colour.",
    variants: [],
  },
  {
    id: "neck",
    label: "Neck",
    shortDescription: "Bore taper and playing feel",
    explainer: "The neck is the first conical section after the mouthpiece. Bore size and taper change resistance, flexibility, focus and how quickly the instrument responds.",
    caveat: "These profiles reproduce Yamaha’s qualitative descriptions of its C1, E1 and V1 alto necks. Fit and result depend on the horn and player.",
    variants: [
      {
        id: "neck-c1",
        name: "C1 · focused",
        eyebrow: "Smallest bore taper",
        summary: "Maximum control, quick response, strong intonation support and a focused centre.",
        useCase: "A useful reference for players who prioritise precision, stable pitch and a compact tonal core.",
        attributes: [
          { label: "Air feel", low: "Resistant", high: "Free", value: 34 },
          { label: "Shape", low: "Focused", high: "Open", value: 18 },
          { label: "Control", low: "Flexible", high: "Directed", value: 88 },
          { label: "Response", low: "Measured", high: "Quick", value: 86 },
        ],
        tone: { brightness: 0.42, response: 0.84, projection: 0.58, resistance: 0.68 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha C1 / E1 / V1 overview",
        sourceUrl: YAMAHA_NECK_SOURCE,
      },
      {
        id: "neck-e1",
        name: "E1 · balanced",
        eyebrow: "Gradual bore taper",
        summary: "Controlled airflow, quick response, dependable intonation and moderate flexibility.",
        useCase: "A versatile middle ground for learners who are still discovering how much focus or freedom they prefer.",
        attributes: [
          { label: "Air feel", low: "Resistant", high: "Free", value: 58 },
          { label: "Shape", low: "Focused", high: "Open", value: 50 },
          { label: "Control", low: "Flexible", high: "Directed", value: 68 },
          { label: "Response", low: "Measured", high: "Quick", value: 82 },
        ],
        tone: { brightness: 0.56, response: 0.8, projection: 0.66, resistance: 0.48 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha C1 / E1 / V1 overview",
        sourceUrl: YAMAHA_NECK_SOURCE,
      },
      {
        id: "neck-v1",
        name: "V1 · expressive",
        eyebrow: "Largest bore",
        summary: "Free-blowing and highly flexible, with a wider dynamic range and palette of expression.",
        useCase: "For players who want more room to shape dynamics and colour and can supply consistent air support.",
        attributes: [
          { label: "Air feel", low: "Resistant", high: "Free", value: 90 },
          { label: "Shape", low: "Focused", high: "Open", value: 86 },
          { label: "Control", low: "Flexible", high: "Directed", value: 25 },
          { label: "Response", low: "Measured", high: "Quick", value: 72 },
        ],
        tone: { brightness: 0.68, response: 0.7, projection: 0.84, resistance: 0.23 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha C1 / E1 / V1 overview",
        sourceUrl: YAMAHA_NECK_SOURCE,
      },
    ],
  },
  {
    id: "mouthpiece",
    label: "Mouthpiece",
    shortDescription: "Tip opening, facing and colour",
    explainer: "The mouthpiece controls the air channel presented to the reed. Tip opening and facing must be matched with reed strength; neither part should be chosen in isolation.",
    caveat: "Tip opening is measurable. Tone labels are manufacturer guidance, not a promise. Yamaha recommends a standard 4C with a 2½ reed as a beginner baseline.",
    variants: [
      {
        id: "mouthpiece-4c",
        name: "4C · foundation",
        eyebrow: "1.60 mm alto tip",
        summary: "Balanced, clear and focused across the register, with approachable response.",
        useCase: "The safest starting reference for building embouchure, long-tone and air-support fundamentals.",
        facts: ["Standard alto tip: 1.60 mm", "Facing length: 23.0 mm"],
        attributes: [
          { label: "Tip opening", low: "Close", high: "Open", value: 36 },
          { label: "Colour range", low: "Focused", high: "Varied", value: 42 },
          { label: "Volume", low: "Moderate", high: "Powerful", value: 44 },
          { label: "Experience", low: "Beginner", high: "Advanced", value: 28 },
        ],
        tone: { brightness: 0.5, response: 0.82, projection: 0.53, resistance: 0.37 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha saxophone mouthpieces",
        sourceUrl: YAMAHA_MOUTHPIECE_SOURCE,
      },
      {
        id: "mouthpiece-5c",
        name: "5C · flexible",
        eyebrow: "1.70 mm alto tip",
        summary: "A richer colour range than 4C with strong flexibility and response.",
        useCase: "A measured step up when the learner can hold pitch and tone while asking for more colour.",
        facts: ["Standard alto tip: 1.70 mm", "Facing length: 23.0 mm"],
        attributes: [
          { label: "Tip opening", low: "Close", high: "Open", value: 60 },
          { label: "Colour range", low: "Focused", high: "Varied", value: 72 },
          { label: "Volume", low: "Moderate", high: "Powerful", value: 65 },
          { label: "Experience", low: "Beginner", high: "Advanced", value: 58 },
        ],
        tone: { brightness: 0.6, response: 0.76, projection: 0.68, resistance: 0.48 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha saxophone mouthpieces",
        sourceUrl: YAMAHA_MOUTHPIECE_SOURCE,
      },
      {
        id: "mouthpiece-6c",
        name: "6C · powerful",
        eyebrow: "1.80 mm alto tip",
        summary: "Powerful volume and broad tonal variation, intended for experienced control.",
        useCase: "For players who can stabilise pitch, voicing and articulation through a more demanding setup.",
        facts: ["Standard alto tip: 1.80 mm", "Facing length: 23.0 mm"],
        attributes: [
          { label: "Tip opening", low: "Close", high: "Open", value: 84 },
          { label: "Colour range", low: "Focused", high: "Varied", value: 86 },
          { label: "Volume", low: "Moderate", high: "Powerful", value: 88 },
          { label: "Experience", low: "Beginner", high: "Advanced", value: 86 },
        ],
        tone: { brightness: 0.69, response: 0.66, projection: 0.88, resistance: 0.64 },
        evidence: "Manufacturer description",
        sourceLabel: "Yamaha saxophone mouthpieces",
        sourceUrl: YAMAHA_MOUTHPIECE_SOURCE,
      },
    ],
  },
  {
    id: "reed",
    label: "Reed",
    shortDescription: "Response, resistance and colour",
    explainer: "The reed starts the sound. Cut and strength affect how readily it speaks, the resistance you feel and which overtones are emphasised. Compatibility with the mouthpiece matters more than a strength number alone.",
    caveat: "The bars below normalise qualitative manufacturer language so options can be compared. They are directional, not laboratory measurements. Audio demos are illustrative synthesis at equal loudness — not product recordings.",
    variants: [
      {
        id: "reed-signature",
        name: "Légère Signature",
        eyebrow: "Responsive all-round cut",
        summary: "Bright and stable, overtone-rich, responsive and articulate; positioned for solo, classical or studio use.",
        useCase: "A versatile reference when you want articulation and colour without the freer jazz bias of American Cut.",
        attributes: [
          { label: "Colour", low: "Bright", high: "Dark", value: 34 },
          { label: "Feel", low: "Flexible", high: "Resistant", value: 35 },
          { label: "Projection", low: "Contained", high: "Projecting", value: 74 },
          { label: "Response", low: "Measured", high: "Immediate", value: 84 },
        ],
        tone: { brightness: 0.72, response: 0.86, projection: 0.74, resistance: 0.35 },
        evidence: "Manufacturer description",
        sourceLabel: "Légère Alto Signature",
        sourceUrl: "https://legere.com/products/eb-alto-saxophone-signature-series",
      },
      {
        id: "reed-american",
        name: "Légère American Cut",
        eyebrow: "Free-blowing jazz cut",
        summary: "Easy-speaking, colourful and edged, with a clear low register and vibrant altissimo.",
        useCase: "A useful comparison when easy response, tonal edge and upper-register energy matter most.",
        attributes: [
          { label: "Colour", low: "Bright", high: "Dark", value: 20 },
          { label: "Feel", low: "Flexible", high: "Resistant", value: 19 },
          { label: "Projection", low: "Contained", high: "Projecting", value: 88 },
          { label: "Response", low: "Measured", high: "Immediate", value: 92 },
        ],
        tone: { brightness: 0.88, response: 0.94, projection: 0.9, resistance: 0.18 },
        evidence: "Manufacturer description",
        sourceLabel: "Légère Alto American Cut",
        sourceUrl: "https://legere.com/products/alto-saxophone-american-cut",
      },
      {
        id: "reed-french",
        name: "Légère French Cut",
        eyebrow: "Centred classical cut",
        summary: "Dark and centred with richness, stability, even response and deliberately balanced resistance.",
        useCase: "A comparison point for concert, chamber and solo work where warmth and a stable tonal core matter.",
        attributes: [
          { label: "Colour", low: "Bright", high: "Dark", value: 82 },
          { label: "Feel", low: "Flexible", high: "Resistant", value: 60 },
          { label: "Projection", low: "Contained", high: "Projecting", value: 75 },
          { label: "Response", low: "Measured", high: "Immediate", value: 80 },
        ],
        tone: { brightness: 0.37, response: 0.8, projection: 0.75, resistance: 0.6 },
        evidence: "Manufacturer description",
        sourceLabel: "Légère French Cut",
        sourceUrl: "https://legere.com/pages/french-cut-saxophone-clarinet-reed",
      },
    ],
  },
  {
    id: "ligature",
    label: "Ligature",
    shortDescription: "Reed grip and handling",
    explainer: "The ligature holds the flat side of the reed against the mouthpiece table. Good fit and even pressure matter first; tonal claims should be treated as secondary and setup-dependent.",
    caveat: "These are educational construction archetypes, not scored products. Compare security, adjustment and repeatability before chasing small tonal differences.",
    variants: [
      {
        id: "ligature-two-screw",
        name: "Two-screw metal",
        eyebrow: "Direct and adjustable",
        summary: "Two independent screws make clamping pressure easy to see and correct.",
        useCase: "A straightforward learning reference: centre the reed, tighten evenly and stop before crushing it.",
        attributes: [
          { label: "Adjustment", low: "Simple", high: "Fine", value: 82 },
          { label: "Grip", low: "Compliant", high: "Firm", value: 78 },
          { label: "Repeatability", low: "Variable", high: "Consistent", value: 82 },
          { label: "Handling", low: "Forgiving", high: "Precise", value: 72 },
        ],
        tone: { brightness: 0.56, response: 0.72, projection: 0.62, resistance: 0.45 },
        evidence: "Educational archetype",
        sourceLabel: "Yamaha reed and mouthpiece structure",
        sourceUrl: YAMAHA_REED_SOURCE,
      },
      {
        id: "ligature-fabric",
        name: "Fabric wrap",
        eyebrow: "Compliant and secure",
        summary: "A broad flexible band distributes pressure and resists slipping.",
        useCase: "Useful when easy handling and a forgiving grip are more important than fine contact adjustments.",
        attributes: [
          { label: "Adjustment", low: "Simple", high: "Fine", value: 42 },
          { label: "Grip", low: "Compliant", high: "Firm", value: 48 },
          { label: "Repeatability", low: "Variable", high: "Consistent", value: 72 },
          { label: "Handling", low: "Forgiving", high: "Precise", value: 34 },
        ],
        tone: { brightness: 0.48, response: 0.68, projection: 0.56, resistance: 0.42 },
        evidence: "Educational archetype",
        sourceLabel: "Yamaha reed and mouthpiece structure",
        sourceUrl: YAMAHA_REED_SOURCE,
      },
      {
        id: "ligature-plate",
        name: "Pressure plate",
        eyebrow: "Defined contact pattern",
        summary: "A rigid plate localises contact while the band supplies tension.",
        useCase: "For experienced comparison after reed placement and screw pressure are already repeatable.",
        attributes: [
          { label: "Adjustment", low: "Simple", high: "Fine", value: 68 },
          { label: "Grip", low: "Compliant", high: "Firm", value: 66 },
          { label: "Repeatability", low: "Variable", high: "Consistent", value: 76 },
          { label: "Handling", low: "Forgiving", high: "Precise", value: 82 },
        ],
        tone: { brightness: 0.58, response: 0.75, projection: 0.64, resistance: 0.46 },
        evidence: "Educational archetype",
        sourceLabel: "Yamaha reed and mouthpiece structure",
        sourceUrl: YAMAHA_REED_SOURCE,
      },
    ],
  },
];

export const SETUP_FOUNDATION_SOURCE = YAMAHA_SELECTION_SOURCE;
