export const SKILL_EVIDENCE_STORAGE_KEY = "bocal-skill-evidence-v1";
export const SKILL_FORMULA_VERSION = "BCR-1.0";

export type TunerEvidenceSession = {
  id: string;
  capturedAt: string;
  durationMs: number;
  acceptedFrames: number;
  medianAbsCents: number;
  madCents: number;
  inTuneRate: number;
  midiNotes: number[];
};

export type FingeringEvidenceAttempt = {
  id: string;
  capturedAt: string;
  noteId: string;
  correctOnFirstCheck: boolean;
};

export type RhythmEvidenceAttempt = {
  id: string;
  capturedAt: string;
  hitCount: number;
  medianAbsoluteErrorMs: number;
};

export type SkillEvidenceBundle = {
  schemaVersion: 1;
  tunerSessions: TunerEvidenceSession[];
  fingeringAttempts: FingeringEvidenceAttempt[];
  rhythmAttempts: RhythmEvidenceAttempt[];
};

export type SkillDimensionId = "intonation" | "stability" | "rhythm" | "fingering" | "range";

export type SkillDimension = {
  id: SkillDimensionId;
  label: string;
  weight: number;
  score: number | null;
  evidence: string;
  formula: string;
};

export type SkillRating = {
  formulaVersion: string;
  rating: number | null;
  level: string;
  status: "unrated" | "provisional" | "established";
  confidence: number;
  weightedSkillScore: number | null;
  dimensions: SkillDimension[];
  evidence: {
    tunerSessions: number;
    acceptedPitchFrames: number;
    fingeringAttempts: number;
    rhythmHits: number;
    distinctNotes: number;
  };
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function weightedMean(values: Array<{ value: number; weight: number }>) {
  const weight = values.reduce((sum, item) => sum + item.weight, 0);
  return weight > 0 ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / weight : 0;
}

export function emptySkillEvidence(): SkillEvidenceBundle {
  return { schemaVersion: 1, tunerSessions: [], fingeringAttempts: [], rhythmAttempts: [] };
}

export function parseSkillEvidence(raw: string | null | undefined): SkillEvidenceBundle {
  if (!raw) return emptySkillEvidence();
  try {
    const value = JSON.parse(raw) as Partial<SkillEvidenceBundle>;
    if (value.schemaVersion !== 1) return emptySkillEvidence();
    return {
      schemaVersion: 1,
      tunerSessions: Array.isArray(value.tunerSessions) ? value.tunerSessions : [],
      fingeringAttempts: Array.isArray(value.fingeringAttempts) ? value.fingeringAttempts : [],
      rhythmAttempts: Array.isArray(value.rhythmAttempts) ? value.rhythmAttempts : [],
    };
  } catch {
    return emptySkillEvidence();
  }
}

export function withTunerSession(bundle: SkillEvidenceBundle, session: TunerEvidenceSession): SkillEvidenceBundle {
  return { ...bundle, tunerSessions: [session, ...bundle.tunerSessions].slice(0, 40) };
}

export function withFingeringAttempt(bundle: SkillEvidenceBundle, attempt: FingeringEvidenceAttempt): SkillEvidenceBundle {
  return { ...bundle, fingeringAttempts: [attempt, ...bundle.fingeringAttempts].slice(0, 120) };
}

export function withRhythmAttempt(bundle: SkillEvidenceBundle, attempt: RhythmEvidenceAttempt): SkillEvidenceBundle {
  return { ...bundle, rhythmAttempts: [attempt, ...bundle.rhythmAttempts].slice(0, 80) };
}

export function summarizeTunerSession(
  cents: number[],
  midiNotes: number[],
  durationMs: number,
  capturedAt = new Date().toISOString(),
): TunerEvidenceSession | null {
  if (cents.length < 15) return null;
  const center = median(cents);
  const absolute = cents.map((value) => Math.abs(value));
  const deviations = cents.map((value) => Math.abs(value - center));
  return {
    id: `tuner-${capturedAt}`,
    capturedAt,
    durationMs: Math.max(0, Math.round(durationMs)),
    acceptedFrames: cents.length,
    medianAbsCents: Number(median(absolute).toFixed(2)),
    madCents: Number(median(deviations).toFixed(2)),
    inTuneRate: Number((cents.filter((value) => Math.abs(value) <= 5).length / cents.length).toFixed(4)),
    midiNotes: [...new Set(midiNotes.map((value) => Math.round(value)))].sort((left, right) => left - right),
  };
}

function ratingLevel(rating: number | null) {
  if (rating === null) return "Not enough evidence";
  if (rating < 700) return "Foundation";
  if (rating < 1000) return "Developing";
  if (rating < 1300) return "Independent";
  if (rating < 1600) return "Advanced";
  if (rating < 1800) return "Performance";
  return "Expert";
}

export function calculateSkillRating(bundle: SkillEvidenceBundle): SkillRating {
  const acceptedPitchFrames = bundle.tunerSessions.reduce((sum, session) => sum + Math.max(0, session.acceptedFrames), 0);
  const tunerSessions = bundle.tunerSessions.length;
  const fingeringAttempts = bundle.fingeringAttempts.length;
  const rhythmHits = bundle.rhythmAttempts.reduce((sum, attempt) => sum + Math.max(0, attempt.hitCount), 0);
  const distinctMidi = new Set(bundle.tunerSessions.flatMap((session) => session.midiNotes));
  const distinctNotes = distinctMidi.size;

  const medianAbsCents = tunerSessions > 0
    ? weightedMean(bundle.tunerSessions.map((session) => ({ value: session.medianAbsCents, weight: Math.max(1, session.acceptedFrames) })))
    : null;
  const medianMad = tunerSessions > 0
    ? weightedMean(bundle.tunerSessions.map((session) => ({ value: session.madCents, weight: Math.max(1, session.acceptedFrames) })))
    : null;
  const firstCheckRate = fingeringAttempts >= 3
    ? bundle.fingeringAttempts.filter((attempt) => attempt.correctOnFirstCheck).length / fingeringAttempts
    : null;
  const rhythmError = rhythmHits >= 16
    ? weightedMean(bundle.rhythmAttempts.map((attempt) => ({ value: attempt.medianAbsoluteErrorMs, weight: Math.max(1, attempt.hitCount) })))
    : null;
  const orderedMidi = [...distinctMidi].sort((left, right) => left - right);
  const semitoneSpan = orderedMidi.length > 1 ? orderedMidi.at(-1)! - orderedMidi[0] : 0;
  const rangeScore = distinctNotes >= 5 ? clamp(((Math.min(semitoneSpan, 24) - 4) / 20) * 100) : null;

  const dimensions: SkillDimension[] = [
    {
      id: "intonation",
      label: "Intonation",
      weight: 0.3,
      score: medianAbsCents === null ? null : Math.round(clamp(100 - medianAbsCents * 3.2)),
      evidence: medianAbsCents === null ? "No accepted tuner frames" : `${medianAbsCents.toFixed(1)}¢ median absolute error`,
      formula: "100 − 3.2 × median absolute cents",
    },
    {
      id: "stability",
      label: "Tone stability",
      weight: 0.2,
      score: medianMad === null ? null : Math.round(clamp(100 - medianMad * 7)),
      evidence: medianMad === null ? "No accepted tuner frames" : `${medianMad.toFixed(1)}¢ median deviation`,
      formula: "100 − 7 × median cents deviation",
    },
    {
      id: "rhythm",
      label: "Rhythm",
      weight: 0.2,
      score: rhythmError === null ? null : Math.round(clamp(100 - rhythmError / 1.5)),
      evidence: rhythmError === null ? `${rhythmHits}/16 measured attacks` : `${rhythmError.toFixed(0)} ms median timing error`,
      formula: "100 − median timing error ÷ 1.5",
    },
    {
      id: "fingering",
      label: "Fingering recall",
      weight: 0.2,
      score: firstCheckRate === null ? null : Math.round(firstCheckRate * 100),
      evidence: firstCheckRate === null ? `${fingeringAttempts}/3 first checks` : `${Math.round(firstCheckRate * 100)}% correct on first check`,
      formula: "First-check correct attempts ÷ all assessed attempts",
    },
    {
      id: "range",
      label: "Observed range",
      weight: 0.1,
      score: rangeScore === null ? null : Math.round(rangeScore),
      evidence: `${distinctNotes} distinct notes · ${semitoneSpan} semitone span`,
      formula: "0 at 4 semitones; 100 at a detected 24-semitone span",
    },
  ];

  const measured = dimensions.filter((dimension) => dimension.score !== null);
  const measuredWeight = measured.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weightedSkillScore = measuredWeight > 0
    ? measured.reduce((sum, dimension) => sum + dimension.score! * dimension.weight, 0) / measuredWeight
    : null;
  const canRate = acceptedPitchFrames >= 75 && measuredWeight >= 0.5;
  const rating = canRate && weightedSkillScore !== null ? Math.round(400 + weightedSkillScore * 16) : null;

  const pitchMaturity = clamp(acceptedPitchFrames / 600, 0, 1);
  const fingeringMaturity = clamp(fingeringAttempts / 30, 0, 1);
  const rhythmMaturity = clamp(rhythmHits / 64, 0, 1);
  const rangeMaturity = clamp(distinctNotes / 18, 0, 1);
  const confidence = Math.round(100 * (
    0.3 * pitchMaturity +
    0.2 * pitchMaturity +
    0.2 * rhythmMaturity +
    0.2 * fingeringMaturity +
    0.1 * rangeMaturity
  ));
  const established = rating !== null && tunerSessions >= 3 && acceptedPitchFrames >= 600 && fingeringAttempts >= 30 && rhythmHits >= 64 && distinctNotes >= 18;
  const status: SkillRating["status"] = rating === null ? "unrated" : established ? "established" : "provisional";

  return {
    formulaVersion: SKILL_FORMULA_VERSION,
    rating,
    level: ratingLevel(rating),
    status,
    confidence,
    weightedSkillScore: weightedSkillScore === null ? null : Number(weightedSkillScore.toFixed(2)),
    dimensions,
    evidence: { tunerSessions, acceptedPitchFrames, fingeringAttempts, rhythmHits, distinctNotes },
  };
}
