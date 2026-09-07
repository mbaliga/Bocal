/**
 * Shared "Look" model for both licensed 3D references (alto saxophone and
 * oboe). A ModelLook never changes geometry -- only material colour/finish,
 * lighting environment, camera framing and a purely cosmetic exploded-view
 * offset. Bocal is explicit in the UI that finish and materials are rendered
 * approximations; the geometry itself is the licensed model, unmodified.
 */

export type ModelId = "saxophone-alto" | "oboe";

export type EnvironmentId = "studio" | "warm" | "cool";
export type BackgroundId = "dark" | "light" | "stage";
export type CameraPresetId = "front" | "left" | "right" | "back" | "player-pov" | "mirrored";

export type ModelLook = {
  bodyFinish: string;
  keyworkFinish: string;
  mouthpiece: string;
  ligature: string;
  highlight: number;
  environment: EnvironmentId;
  background: BackgroundId;
  cameraPreset: CameraPresetId;
  exploded: boolean;
};

export const DEFAULT_HIGHLIGHT = 0x08fed5;

/** Bronze-study bronze, kept as the honest "uniform reference" default. */
export const DEFAULT_BODY_HEX = 0xa66d2d;
export const DEFAULT_KEYWORK_HEX = 0xd7a94d;

// ---------------------------------------------------------------------------
// Saxophone finishes
// ---------------------------------------------------------------------------

export type SaxFinish = {
  id: string;
  name: string;
  body: number;
  bodyHighlight: number;
};

export type SaxKeyworkFinish = {
  id: string;
  name: string;
  keywork: number;
  keyworkLight: number;
};

export type SaxMouthpieceOption = { id: string; name: string; color: number; metallic: boolean };
export type SaxLigatureOption = { id: string; name: string; color: number; shape: "two-screw" | "single-screw" | "plate" };

// Nine body finishes: the six shipped SAX_COLORWAYS bodies plus three new
// study finishes that only exist here because they need no keywork pairing.
export const SAX_BODY_FINISHES: SaxFinish[] = [
  { id: "noir-gold", name: "Noir & gold", body: 0x050506, bodyHighlight: 0x292315 },
  { id: "classic-gold", name: "Classic gold", body: 0xb47d20, bodyHighlight: 0xe0b64f },
  { id: "gold-silver", name: "Gold & silver", body: 0xb47d20, bodyHighlight: 0xe0b64f },
  { id: "rose-gold", name: "Rose & gold", body: 0x9f145c, bodyHighlight: 0xf154a1 },
  { id: "prism-gold", name: "Prism & gold", body: 0x37206d, bodyHighlight: 0x10b7bb },
  { id: "black-silver", name: "Black & silver", body: 0x050506, bodyHighlight: 0x22262a },
  { id: "unlacquered", name: "Unlacquered", body: 0xc8a877, bodyHighlight: 0xe9d5a8 },
  { id: "vintage", name: "Vintage", body: 0x6b4a26, bodyHighlight: 0x9c7238 },
  { id: "black-nickel", name: "Black nickel", body: 0x141416, bodyHighlight: 0x3a3c40 },
];

export const SAX_KEYWORK_FINISHES: SaxKeyworkFinish[] = [
  { id: "gold", name: "Gold", keywork: 0xc8922f, keyworkLight: 0xf1c65c },
  { id: "silver", name: "Silver", keywork: 0xbec4c9, keyworkLight: 0xf0f3f4 },
  { id: "black-nickel", name: "Black nickel", keywork: 0x2c2d30, keyworkLight: 0x54565a },
];

export const SAX_MOUTHPIECE_OPTIONS: SaxMouthpieceOption[] = [
  { id: "hard-rubber", name: "Hard rubber", color: 0x0c0a09, metallic: false },
  { id: "metal", name: "Metal", color: 0xb7bcc0, metallic: true },
];

export const SAX_LIGATURE_OPTIONS: SaxLigatureOption[] = [
  { id: "two-screw", name: "Two-screw", color: 0xbec4c9, shape: "two-screw" },
  { id: "single-screw", name: "Single-screw plate", color: 0xc8922f, shape: "plate" },
  { id: "fabric", name: "Fabric", color: 0x2a2620, shape: "single-screw" },
];

// ---------------------------------------------------------------------------
// Oboe finishes
// ---------------------------------------------------------------------------

export type OboeWoodType = { id: string; name: string; tint: number };
export type OboeKeyFinish = { id: string; name: string; tint: number; useGoldTexture?: boolean };

export const OBOE_WOOD_TYPES: OboeWoodType[] = [
  // "Reference" is the honest default: the source texture with only the
  // neutral bronze-study tint applied, no invented wood colour claimed.
  { id: "reference", name: "Reference (bronze study)", tint: DEFAULT_BODY_HEX },
  { id: "grenadilla", name: "Grenadilla", tint: 0x171310 },
  { id: "rosewood", name: "Rosewood", tint: 0x6b2b20 },
  { id: "cocobolo", name: "Cocobolo", tint: 0x7a3a18 },
  { id: "synthetic", name: "Synthetic composite", tint: 0x2b2c2e },
];

export const OBOE_KEY_FINISHES: OboeKeyFinish[] = [
  { id: "silver", name: "Silver (live texture)", tint: 0xffffff },
  { id: "gold", name: "Gold", tint: 0xffffff, useGoldTexture: true },
  { id: "black-nickel", name: "Black nickel", tint: 0x2a2a2c },
];

// ---------------------------------------------------------------------------
// Environments / camera / defaults
// ---------------------------------------------------------------------------

export const ENVIRONMENTS: Array<{ id: EnvironmentId; name: string; lightTint: number; exposureScale: number }> = [
  { id: "studio", name: "Studio", lightTint: 0xffffff, exposureScale: 1 },
  { id: "warm", name: "Warm", lightTint: 0xffcf9e, exposureScale: 1.08 },
  { id: "cool", name: "Cool", lightTint: 0x9ecbff, exposureScale: 0.94 },
];

export const BACKGROUNDS: Array<{ id: BackgroundId; name: string }> = [
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
  { id: "stage", name: "Stage" },
];

export const CAMERA_PRESETS: Array<{ id: CameraPresetId; name: string }> = [
  { id: "front", name: "Front" },
  { id: "left", name: "Left" },
  { id: "right", name: "Right" },
  { id: "back", name: "Back" },
  { id: "player-pov", name: "Player POV" },
  { id: "mirrored", name: "Mirrored (left-handed)" },
];

export function defaultSaxLook(): ModelLook {
  return {
    bodyFinish: "noir-gold",
    keyworkFinish: "gold",
    mouthpiece: "hard-rubber",
    ligature: "two-screw",
    highlight: DEFAULT_HIGHLIGHT,
    environment: "studio",
    background: "dark",
    cameraPreset: "front",
    exploded: false,
  };
}

export function defaultOboeLook(): ModelLook {
  return {
    bodyFinish: "reference",
    keyworkFinish: "silver",
    mouthpiece: "hard-rubber",
    ligature: "two-screw",
    highlight: DEFAULT_HIGHLIGHT,
    environment: "studio",
    background: "dark",
    cameraPreset: "front",
    exploded: false,
  };
}

// ---------------------------------------------------------------------------
// Persistence -- one localStorage key holding a look per instrument id.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bocal-model-look-v1";

function sanitizeLook(raw: unknown, fallback: ModelLook): ModelLook {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<ModelLook>;
  return {
    bodyFinish: typeof value.bodyFinish === "string" ? value.bodyFinish : fallback.bodyFinish,
    keyworkFinish: typeof value.keyworkFinish === "string" ? value.keyworkFinish : fallback.keyworkFinish,
    mouthpiece: typeof value.mouthpiece === "string" ? value.mouthpiece : fallback.mouthpiece,
    ligature: typeof value.ligature === "string" ? value.ligature : fallback.ligature,
    highlight: typeof value.highlight === "number" ? value.highlight : fallback.highlight,
    environment: value.environment === "studio" || value.environment === "warm" || value.environment === "cool" ? value.environment : fallback.environment,
    background: value.background === "dark" || value.background === "light" || value.background === "stage" ? value.background : fallback.background,
    cameraPreset:
      value.cameraPreset === "front" ||
      value.cameraPreset === "left" ||
      value.cameraPreset === "right" ||
      value.cameraPreset === "back" ||
      value.cameraPreset === "player-pov" ||
      value.cameraPreset === "mirrored"
        ? value.cameraPreset
        : fallback.cameraPreset,
    exploded: typeof value.exploded === "boolean" ? value.exploded : fallback.exploded,
  };
}

export function loadModelLook(instrumentId: string, fallback: ModelLook): ModelLook {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return sanitizeLook(parsed[instrumentId], fallback);
  } catch {
    return fallback;
  }
}

export function saveModelLook(instrumentId: string, look: ModelLook) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[instrumentId] = look;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Look choices simply do not persist without storage access.
  }
}

// ---------------------------------------------------------------------------
// Part classification -- explicit tables, not name/luminance heuristics.
// ---------------------------------------------------------------------------

export type SaxPartRole = "body" | "mouthpiece" | "ligature" | "keywork";
export type OboePartRole = "body" | "keywork";

const SAX_PART_TABLE: Record<string, SaxPartRole> = {
  Object_2: "body",
  Object_5: "mouthpiece",
  Object_6: "ligature",
  Object_3: "keywork",
  Object_4: "keywork",
  Object_7: "keywork",
  Object_8: "keywork",
  Object_9: "keywork",
};

export function classifySaxPart(meshName: string): SaxPartRole {
  return SAX_PART_TABLE[meshName] ?? "keywork";
}

/** Oboe meshes are classified by walking up to the Oboe_Base/Static/Moving parent. */
export function classifyOboePart(ancestorNames: string[]): OboePartRole {
  if (ancestorNames.some((name) => name === "Oboe_Base")) return "body";
  return "keywork";
}
