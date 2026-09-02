export type PitchCandidate = {
  hz: number;
  confidence: number;
};

export type PitchTrackerState = "calibrating" | "silence" | "acquiring" | "locked" | "holding";

export type PitchTrackerReading = {
  state: PitchTrackerState;
  hz: number | null;
  rawHz: number | null;
  confidence: number;
  rms: number;
  gate: number;
  accepted: boolean;
};

export type StablePitchTrackerOptions = {
  minHz?: number;
  maxHz?: number;
  yinThreshold?: number;
  minimumConfidence?: number;
  calibrationMs?: number;
  acquireFrames?: number;
  switchFrames?: number;
  holdMs?: number;
  clearMs?: number;
  /**
   * Base smoothing rate applied to the displayed cents-from-lock value (0-1,
   * higher means it snaps to a new reading faster / smooths less). Used for
   * frames below the high-confidence threshold. Together with
   * `smoothingAlphaHigh` this is the tuner's "Damping" control.
   */
  smoothingAlpha?: number;
  /** Smoothing rate used once a frame's confidence reaches 0.96 or above. */
  smoothingAlphaHigh?: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function frameRms(buffer: Float32Array) {
  let total = 0;
  for (let index = 0; index < buffer.length; index += 1) total += buffer[index] * buffer[index];
  return Math.sqrt(total / Math.max(buffer.length, 1));
}

/**
 * Clean-room YIN-style periodicity detector. It returns a candidate only when
 * the cumulative mean normalized difference has a convincing local minimum.
 */
export function detectPitchYin(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 120,
  maxHz = 1600,
  threshold = 0.13,
): PitchCandidate | null {
  const minimumTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maximumTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buffer.length / 2));
  if (maximumTau <= minimumTau + 2) return null;

  const windowLength = buffer.length - maximumTau;
  const difference = new Float32Array(maximumTau + 1);
  const normalized = new Float32Array(maximumTau + 1);
  normalized[0] = 1;

  for (let tau = 1; tau <= maximumTau; tau += 1) {
    let sum = 0;
    for (let index = 0; index < windowLength; index += 1) {
      const delta = buffer[index] - buffer[index + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  let running = 0;
  let bestTau = -1;
  let bestValue = Number.POSITIVE_INFINITY;
  for (let tau = 1; tau <= maximumTau; tau += 1) {
    running += difference[tau];
    normalized[tau] = running > 0 ? (difference[tau] * tau) / running : 1;
    if (tau >= minimumTau && normalized[tau] < bestValue) {
      bestValue = normalized[tau];
      bestTau = tau;
    }
  }

  let selectedTau = -1;
  for (let tau = minimumTau; tau <= maximumTau; tau += 1) {
    if (normalized[tau] >= threshold) continue;
    while (tau + 1 <= maximumTau && normalized[tau + 1] < normalized[tau]) tau += 1;
    selectedTau = tau;
    break;
  }

  // A slightly weaker but still strongly periodic tone may miss the first
  // threshold crossing. Reject broad/noisy minima instead of guessing.
  if (selectedTau < 0 && bestValue < 0.2) selectedTau = bestTau;
  if (selectedTau < 0) return null;

  const left = normalized[Math.max(1, selectedTau - 1)];
  const center = normalized[selectedTau];
  const right = normalized[Math.min(maximumTau, selectedTau + 1)];
  const denominator = left - 2 * center + right;
  const adjustment = Math.abs(denominator) > 1e-9 ? 0.5 * (left - right) / denominator : 0;
  const refinedTau = selectedTau + clamp(adjustment, -0.5, 0.5);
  const hz = sampleRate / refinedTau;
  const confidence = clamp(1 - center, 0, 1);
  if (!Number.isFinite(hz) || hz < minHz || hz > maxHz) return null;
  return { hz, confidence };
}

function midiFloat(hz: number) {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToHz(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

export class StablePitchTracker {
  private readonly minHz: number;
  private readonly maxHz: number;
  private readonly yinThreshold: number;
  private readonly minimumConfidence: number;
  private readonly calibrationMs: number;
  private readonly acquireFrames: number;
  private readonly switchFrames: number;
  private readonly holdMs: number;
  private readonly clearMs: number;
  private readonly smoothingAlpha: number;
  private readonly smoothingAlphaHigh: number;
  private noiseFloor = 0.0035;
  private startedAt: number | null = null;
  private lockedMidi: number | null = null;
  private pendingMidi: number | null = null;
  private pendingFrames = 0;
  private pendingCents: number[] = [];
  private centsHistory: number[] = [];
  private smoothedCents = 0;
  private lastReliableAt = Number.NEGATIVE_INFINITY;
  private lastConfidence = 0;

  constructor(options: StablePitchTrackerOptions = {}) {
    this.minHz = options.minHz ?? 120;
    this.maxHz = options.maxHz ?? 1600;
    this.yinThreshold = options.yinThreshold ?? 0.13;
    this.minimumConfidence = options.minimumConfidence ?? 0.88;
    this.calibrationMs = options.calibrationMs ?? 320;
    this.acquireFrames = options.acquireFrames ?? 3;
    this.switchFrames = options.switchFrames ?? 3;
    this.holdMs = options.holdMs ?? 550;
    this.clearMs = options.clearMs ?? 1200;
    this.smoothingAlpha = options.smoothingAlpha ?? 0.22;
    this.smoothingAlphaHigh = options.smoothingAlphaHigh ?? 0.34;
  }

  reset() {
    this.noiseFloor = 0.0035;
    this.startedAt = null;
    this.lockedMidi = null;
    this.pendingMidi = null;
    this.pendingFrames = 0;
    this.pendingCents = [];
    this.centsHistory = [];
    this.smoothedCents = 0;
    this.lastReliableAt = Number.NEGATIVE_INFINITY;
    this.lastConfidence = 0;
  }

  process(buffer: Float32Array, sampleRate: number, nowMs: number): PitchTrackerReading {
    if (this.startedAt === null) this.startedAt = nowMs;
    const rms = frameRms(buffer);
    const gate = clamp(this.noiseFloor * 3.1, 0.009, 0.045);
    const candidate = rms >= 0.004
      ? detectPitchYin(buffer, sampleRate, this.minHz, this.maxHz, this.yinThreshold)
      : null;
    const reliable = Boolean(candidate && candidate.confidence >= this.minimumConfidence && rms >= gate);

    if (!reliable && (!candidate || candidate.confidence < 0.72)) {
      const boundedNoise = clamp(rms, 0.0005, 0.04);
      this.noiseFloor = this.noiseFloor * 0.94 + boundedNoise * 0.06;
    }

    if (nowMs - this.startedAt < this.calibrationMs) {
      return { state: "calibrating", hz: null, rawHz: candidate?.hz ?? null, confidence: candidate?.confidence ?? 0, rms, gate, accepted: false };
    }

    if (!reliable || !candidate) return this.unreliableReading(nowMs, rms, gate, candidate);

    const rawMidi = midiFloat(candidate.hz);
    const candidateMidi = Math.round(rawMidi);
    this.lastConfidence = candidate.confidence;

    if (this.lockedMidi === null) {
      this.advancePending(candidateMidi, rawMidi);
      if (this.pendingFrames < this.acquireFrames || this.pendingSpread() > 42) {
        return { state: "acquiring", hz: null, rawHz: candidate.hz, confidence: candidate.confidence, rms, gate, accepted: false };
      }
      this.acquire(candidateMidi, rawMidi, nowMs);
      return this.lockedReading(candidate.hz, candidate.confidence, rms, gate, true);
    }

    const centsFromLock = (rawMidi - this.lockedMidi) * 100;
    if (Math.abs(centsFromLock) <= 65) {
      this.pendingMidi = null;
      this.pendingFrames = 0;
      this.pendingCents = [];
      this.lastReliableAt = nowMs;
      this.pushCents(centsFromLock);
      const target = median(this.centsHistory.slice(-5));
      const alpha = candidate.confidence >= 0.96 ? this.smoothingAlphaHigh : this.smoothingAlpha;
      this.smoothedCents += (target - this.smoothedCents) * alpha;
      return this.lockedReading(candidate.hz, candidate.confidence, rms, gate, true);
    }

    this.advancePending(candidateMidi, rawMidi);
    if (this.pendingFrames >= this.switchFrames && this.pendingSpread() <= 42) {
      this.acquire(candidateMidi, rawMidi, nowMs);
      return this.lockedReading(candidate.hz, candidate.confidence, rms, gate, true);
    }

    return this.lockedReading(candidate.hz, candidate.confidence, rms, gate, false, "holding");
  }

  private advancePending(candidateMidi: number, rawMidi: number) {
    if (this.pendingMidi === candidateMidi) {
      this.pendingFrames += 1;
      this.pendingCents.push((rawMidi - candidateMidi) * 100);
      this.pendingCents = this.pendingCents.slice(-Math.max(this.acquireFrames, this.switchFrames));
      return;
    }
    this.pendingMidi = candidateMidi;
    this.pendingFrames = 1;
    this.pendingCents = [(rawMidi - candidateMidi) * 100];
  }

  private pendingSpread() {
    if (this.pendingCents.length < 2) return 0;
    return Math.max(...this.pendingCents) - Math.min(...this.pendingCents);
  }

  private acquire(candidateMidi: number, rawMidi: number, nowMs: number) {
    this.lockedMidi = candidateMidi;
    this.centsHistory = [(rawMidi - candidateMidi) * 100];
    this.smoothedCents = this.centsHistory[0];
    this.lastReliableAt = nowMs;
    this.pendingMidi = null;
    this.pendingFrames = 0;
    this.pendingCents = [];
  }

  private pushCents(cents: number) {
    this.centsHistory.push(cents);
    this.centsHistory = this.centsHistory.slice(-9);
  }

  private lockedReading(
    rawHz: number | null,
    confidence: number,
    rms: number,
    gate: number,
    accepted: boolean,
    state: "locked" | "holding" = "locked",
  ): PitchTrackerReading {
    const hz = this.lockedMidi === null ? null : midiToHz(this.lockedMidi) * 2 ** (this.smoothedCents / 1200);
    return { state, hz, rawHz, confidence, rms, gate, accepted };
  }

  private unreliableReading(
    nowMs: number,
    rms: number,
    gate: number,
    candidate: PitchCandidate | null,
  ): PitchTrackerReading {
    this.pendingMidi = null;
    this.pendingFrames = 0;
    this.pendingCents = [];
    const elapsed = nowMs - this.lastReliableAt;
    if (this.lockedMidi !== null && elapsed <= this.holdMs) {
      return this.lockedReading(candidate?.hz ?? null, this.lastConfidence, rms, gate, false, "holding");
    }
    // Once the visible hold expires, require a fresh multi-frame acquisition.
    // Keeping a dormant note lock would let a single returning frame reappear.
    if (elapsed > Math.min(this.holdMs, this.clearMs)) {
      this.lockedMidi = null;
      this.centsHistory = [];
      this.smoothedCents = 0;
    }
    return { state: "silence", hz: null, rawHz: candidate?.hz ?? null, confidence: candidate?.confidence ?? 0, rms, gate, accepted: false };
  }
}

// Sensitivity and Damping: the two player-facing controls the Calibration
// disclosure exposes over this tracker. They're presented as short named
// choices (matching TE's wind-mode sensitivity and damping controls) rather
// than raw numeric fields, and each choice maps to a fixed set of
// constructor options below. All of `acquireFrames`, `switchFrames`,
// `minimumConfidence`, `holdMs`, `smoothingAlpha` and `smoothingAlphaHigh`
// are read-only after construction (see the private readonly fields above),
// so switching either control has to build a new StablePitchTracker rather
// than reconfigure the running one -- see the tracker-recreation effect in
// page.tsx for where that happens and why that's an acceptable trade.

export type Sensitivity = "wide" | "medium" | "fine" | "ultra-fine";
export type Damping = "slow" | "normal" | "fast";

export const SENSITIVITY_ORDER: Sensitivity[] = ["wide", "medium", "fine", "ultra-fine"];
export const DAMPING_ORDER: Damping[] = ["slow", "normal", "fast"];

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  wide: "Wide",
  medium: "Medium",
  fine: "Fine",
  "ultra-fine": "Ultra-fine",
};
export const DAMPING_LABELS: Record<Damping, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };

export const SENSITIVITY_HINTS: Record<Sensitivity, string> = {
  wide: "Locks fast on a looser match. Good for a noisy room or a less steady tone.",
  medium: "Bocal's default balance of speed and precision.",
  fine: "Waits for a steadier tone before it locks, for more critical listening.",
  "ultra-fine": "Requires the steadiest, most confident tone before it commits. For meticulous intonation work.",
};
export const DAMPING_HINTS: Record<Damping, string> = {
  slow: "Holds the last note longer through brief dropouts and eases into pitch changes gradually.",
  normal: "Bocal's default response time.",
  fast: "Responds to a new pitch and drops the lock quickly. Good for fast passages.",
};

// "Wide" trades the lock threshold down and the frame count down together --
// it commits sooner and on a weaker match, mirroring TE's "wide" sensitivity.
// "Ultra-fine" pushes both up, waiting for more frames at a stricter
// confidence bar before it will call a note locked.
export const SENSITIVITY_PRESETS: Record<
  Sensitivity,
  Pick<StablePitchTrackerOptions, "acquireFrames" | "switchFrames" | "minimumConfidence">
> = {
  wide: { acquireFrames: 2, switchFrames: 2, minimumConfidence: 0.8 },
  medium: { acquireFrames: 3, switchFrames: 3, minimumConfidence: 0.88 },
  fine: { acquireFrames: 4, switchFrames: 4, minimumConfidence: 0.92 },
  "ultra-fine": { acquireFrames: 6, switchFrames: 6, minimumConfidence: 0.96 },
};

export const DAMPING_PRESETS: Record<
  Damping,
  Pick<StablePitchTrackerOptions, "holdMs" | "smoothingAlpha" | "smoothingAlphaHigh">
> = {
  slow: { holdMs: 900, smoothingAlpha: 0.14, smoothingAlphaHigh: 0.22 },
  normal: { holdMs: 550, smoothingAlpha: 0.22, smoothingAlphaHigh: 0.34 },
  fast: { holdMs: 300, smoothingAlpha: 0.34, smoothingAlphaHigh: 0.5 },
};
