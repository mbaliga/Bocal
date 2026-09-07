"use client";

import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleDot,
  Ear,
  ExternalLink,
  Eye,
  Headphones,
  Info,
  Lightbulb,
  Link2,
  Maximize2,
  Minimize2,
  MousePointer2,
  RefreshCw,
  Rotate3D,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Volume2,
  Wind,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FingeringChart } from "./FingeringChart";
import { FINGERING_CHARTS } from "./fingering-charts";
import { ImportedInstrumentCanvas, type InstrumentViewId } from "./ImportedInstrumentCanvas";
import { ModelLookPanel } from "./ModelLookPanel";
import { OboeLab } from "./OboeLab";
import { INSTRUMENTS, type InstrumentId } from "./instruments";
import { defaultSaxLook, loadModelLook, saveModelLook, type ModelLook } from "./model-looks";
import type { NotationSystem } from "./notation";
import "./styles/model-look.css";
import {
  SAXOPHONE_FINGERINGS,
  midiToFrequency,
  midiToName,
  SAX_KEYS,
  SAX_MECHANICS,
  type Fingering,
  type FingeringOption,
  type ReviewStatus,
  type SaxKeyId,
  writtenToConcert,
} from "./sax-data";
import {
  SAX_COLORWAYS,
  SAX_SETUP_PARTS,
  SETUP_FOUNDATION_SOURCE,
  type SaxColorway,
  type SetupPartId,
  type SetupVariant,
  type ToneProfile,
} from "./sax-setup-data";
import {
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  withFingeringAttempt,
} from "./skill-rating";

type TrainerMode = "learn" | "challenge";

const REFERENCE_VIEW_PRESETS: Array<{ id: InstrumentViewId; label: string }> = [
  { id: "front", label: "Player" },
  { id: "left", label: "Left controls" },
  { id: "right", label: "Right controls" },
  { id: "back", label: "Thumb / back" },
];

type FingeringChoice = {
  id: string;
  label: string;
  keys: SaxKeyId[];
  hint: string;
  useWhen?: string;
  isPrimary: boolean;
  review?: ReviewStatus;
};

function sameKeys(left: Set<SaxKeyId>, right: SaxKeyId[]) {
  return left.size === right.length && right.every((key) => left.has(key));
}

function fingeringChoices(fingering: Fingering): FingeringChoice[] {
  return [
    {
      id: `${fingering.id}-primary`,
      label: fingering.primaryLabel ?? "Primary",
      keys: fingering.keys,
      hint: fingering.hint,
      isPrimary: true,
      review: fingering.review,
    },
    ...(fingering.alternates ?? []).map((alternate: FingeringOption) => ({
      ...alternate,
      isPrimary: false,
    })),
  ];
}

/**
 * Altissimo and its new alternates are common published fingerings pulled
 * from method literature, not fingerings a teacher has checked for Bocal
 * (see the sourcing note above SAXOPHONE_FINGERINGS's altissimo block in
 * sax-data.ts). This badge is the honesty marker for that gap -- it must
 * never be dropped from a fingering that carries review: "unverified".
 */
function ReviewBadge() {
  return (
    <span className="review-badge" title="Not checked by a teacher for Bocal -- a common published fingering.">
      <ShieldAlert size={11} /> Unverified
    </span>
  );
}

function hexColour(value: number) {
  return `#${value.toString(16).padStart(6, "0")}`;
}


export function SaxophoneLab({
  onBack,
  instrumentId = "alto-sax",
  notation = "western",
  saTonic = 0,
}: {
  onBack: () => void;
  instrumentId?: InstrumentId;
  notation?: NotationSystem;
  saTonic?: number;
}) {
  const tier = INSTRUMENTS[instrumentId].labTier;
  if (tier === "anatomy") return <OboeLab onBack={onBack} instrumentId={instrumentId} notation={notation} saTonic={saTonic} />;
  if (tier === "chart") return <FingeringChartLab onBack={onBack} instrumentId={instrumentId} notation={notation} saTonic={saTonic} />;
  if (tier === "none") return <LabUnavailable onBack={onBack} instrumentId={instrumentId} />;
  return <SaxFingeringLab onBack={onBack} instrumentId={instrumentId} />;
}

/**
 * The lab for every chart-only instrument (flute, clarinet, bassoon): no
 * licensed 3D model, so this is the fingering chart on its own -- header,
 * note browser and diagram, nothing else competing for the screen.
 */
function FingeringChartLab({
  onBack,
  instrumentId,
  notation,
  saTonic,
}: {
  onBack: () => void;
  instrumentId: InstrumentId;
  notation: NotationSystem;
  saTonic: number;
}) {
  const instrument = INSTRUMENTS[instrumentId];
  const chart = FINGERING_CHARTS[instrumentId];
  return (
    <div className="sax-lab-view chart-lab-view">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Fingering chart · {instrument.name}</p>
          <h1>See exactly which keys to press.</h1>
          <p>Pick a written note and the diagram shows the standard fingering for it. No 3D model exists yet for the {instrument.shortName.toLowerCase()}, so this chart stands on its own.</p>
        </div>
      </header>
      {chart ? (
        <FingeringChart chart={chart} instrument={instrument} notation={notation} tonic={saTonic} />
      ) : (
        <p className="lab-unavailable-note">No chart data is registered for {instrument.name.toLowerCase()} yet.</p>
      )}
    </div>
  );
}

/**
 * Shown for instruments Bocal supports everywhere except the lab. Rather
 * than hiding the tab or silently showing the alto's model under another
 * instrument's name, this says plainly what is missing and points at the tools
 * that do work for it.
 */
function LabUnavailable({ onBack, instrumentId }: { onBack: () => void; instrumentId: InstrumentId }) {
  const profile = INSTRUMENTS[instrumentId];
  return (
    <div className="lab-unavailable">
      <button className="lab-back" onClick={onBack}>Back to the tuner</button>
      <h1>The {profile.name.toLowerCase()} lab is not built yet.</h1>
      <p>
        The lab needs either a 3D model Bocal is licensed to ship or a fingering chart checked against
        published references. Neither is in place for the {profile.name.toLowerCase()} yet, and showing a
        guessed fingering to someone learning it would do more harm than showing nothing.
      </p>
      <p className="lab-unavailable-note">
        Everything else works for the {profile.name.toLowerCase()}: the tuner already transposes to
        {profile.writtenOffset === 0 ? " concert pitch" : ` ${profile.pitchLabel}`}, and pulse, analysis and
        practice logging are all live.
      </p>
      <button className="lab-unavailable-cta" onClick={onBack}>Open the tuner</button>
    </div>
  );
}

/**
 * The interactive lab for every saxophone. Soprano, alto, tenor and
 * baritone read the same written note off the same grip, so one fingering
 * map and one 3D model serve all four -- the model itself is an alto, so
 * every screen for a non-alto horn says so plainly instead of letting a
 * tenor or bari player think they are looking at their own instrument.
 */
function SaxFingeringLab({ onBack, instrumentId }: { onBack: () => void; instrumentId: InstrumentId }) {
  const instrument = INSTRUMENTS[instrumentId];
  const isAlto = instrumentId === "alto-sax";
  const initialIndex = SAXOPHONE_FINGERINGS.findIndex((fingering) => fingering.id === "a4");
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("learn");
  const [activeKeys, setActiveKeys] = useState<Set<SaxKeyId>>(() => new Set(SAXOPHONE_FINGERINGS[initialIndex].keys));
  const [challenge, setChallenge] = useState<Fingering | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "retry">("idle");
  // Altissimo is far more setup-dependent than the standard range covered by
  // the rest of this chart (see the sourcing note in sax-data.ts), so a
  // beginner working through Challenge mode shouldn't be quizzed on it by
  // default. Players who do want the drill can opt in here.
  const [includeAltissimoInChallenge, setIncludeAltissimoInChallenge] = useState(false);
  const [resetView, setResetView] = useState(0);
  const [showGuides, setShowGuides] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [referenceViewPreset, setReferenceViewPreset] = useState<InstrumentViewId>("front");
  const [look, setLook] = useState<ModelLook>(() => loadModelLook(instrumentId, defaultSaxLook()));
  const [lookInstrumentId, setLookInstrumentId] = useState(instrumentId);
  const [setupPartId, setSetupPartId] = useState<SetupPartId>("reed");
  const [comparisonIds, setComparisonIds] = useState<string[]>(["reed-signature", "reed-french"]);
  const [demoPlaying, setDemoPlaying] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const challengeEvidenceRecordedRef = useRef(false);

  // Re-hydrate the look when the instrument identity changes (adjusting
  // state during render, not in an effect, so this never cascades).
  if (instrumentId !== lookInstrumentId) {
    setLookInstrumentId(instrumentId);
    setLook(loadModelLook(instrumentId, defaultSaxLook()));
  }

  const updateLook = useCallback((next: Partial<ModelLook>) => {
    setLook((current) => {
      const merged = { ...current, ...next };
      saveModelLook(instrumentId, merged);
      return merged;
    });
  }, [instrumentId]);

  const selected = SAXOPHONE_FINGERINGS[selectedIndex];
  const choices = fingeringChoices(selected);
  const selectedChoice = choices[Math.min(choiceIndex, choices.length - 1)];
  const firstAltissimoIndex = useMemo(
    () => SAXOPHONE_FINGERINGS.findIndex((fingering) => fingering.level === "Altissimo"),
    [],
  );
  const colorway = SAX_COLORWAYS.find((candidate) => candidate.id === look.bodyFinish) ?? SAX_COLORWAYS[0];
  const setupPart = SAX_SETUP_PARTS.find((part) => part.id === setupPartId) ?? SAX_SETUP_PARTS[0];
  const activeKeyDetails = SAX_KEYS.filter((key) => activeKeys.has(key.id));
  const concertMidi = writtenToConcert(selected.midi, instrument.writtenOffset);
  const soundingHz = midiToFrequency(concertMidi);

  const getAudioContext = useCallback(async () => {
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    if (context.state === "suspended") await context.resume();
    return context;
  }, []);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setImmersive(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [immersive]);

  const chooseChoice = useCallback((fingering: Fingering, index: number) => {
    const nextChoice = fingeringChoices(fingering)[index] ?? fingeringChoices(fingering)[0];
    setChoiceIndex(index);
    setActiveKeys(new Set(nextChoice.keys));
    setFeedback("idle");
  }, []);

  const chooseNote = useCallback((index: number) => {
    const wrapped = (index + SAXOPHONE_FINGERINGS.length) % SAXOPHONE_FINGERINGS.length;
    const next = SAXOPHONE_FINGERINGS[wrapped];
    setSelectedIndex(wrapped);
    chooseChoice(next, 0);
    // Browsing notes while a challenge is active used to leave the on-screen
    // note and keys pointing at whatever was clicked while `checkChallenge`
    // kept comparing against the original target -- an unwinnable desync.
    // Retarget the challenge to the browsed note instead, the same way
    // `startChallenge` sets one up.
    if (trainerMode === "challenge") {
      setChallenge(next);
      setFeedback("idle");
      challengeEvidenceRecordedRef.current = false;
    }
  }, [chooseChoice, trainerMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      // The page-level workspace shortcut also listens for these on
      // `window`; without stopping propagation here it unmounts the lab and
      // switches to the next workspace instead of stepping notes.
      event.preventDefault();
      event.stopPropagation();
      chooseNote(selectedIndex + (event.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [chooseNote, selectedIndex]);

  const findMatch = useCallback((next: Set<SaxKeyId>) => {
    for (let fingeringIndex = 0; fingeringIndex < SAXOPHONE_FINGERINGS.length; fingeringIndex += 1) {
      const options = fingeringChoices(SAXOPHONE_FINGERINGS[fingeringIndex]);
      const optionIndex = options.findIndex((option) => sameKeys(next, option.keys));
      if (optionIndex >= 0) return { fingeringIndex, optionIndex };
    }
    return null;
  }, []);

  const toggleKey = useCallback((id: SaxKeyId) => {
    setActiveKeys((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (trainerMode === "learn") {
        const match = findMatch(next);
        if (match) {
          setSelectedIndex(match.fingeringIndex);
          setChoiceIndex(match.optionIndex);
        }
      }
      setFeedback("idle");
      return next;
    });
  }, [findMatch, trainerMode]);

  const playTone = async () => {
    const context = await getAudioContext();
    const now = context.currentTime;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.06);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
    filter.connect(master).connect(context.destination);
    [1, 2, 3].forEach((multiple, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = soundingHz * multiple;
      gain.gain.value = [0.72, 0.2, 0.08][index];
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + 1.7);
    });
  };

  const playCharacterDemo = async (id: string, profile: ToneProfile) => {
    const context = await getAudioContext();
    const now = context.currentTime;
    const duration = 1.45;
    const attack = 0.045 + (1 - profile.response) * 0.13 + profile.resistance * 0.035;
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7 + profile.projection * 1.4;
    filter.frequency.setValueAtTime(1150 + profile.brightness * 3700, now);
    const peak = 0.085;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + attack);
    master.gain.setValueAtTime(peak * (0.9 + profile.projection * 0.1), now + duration - 0.28);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    filter.connect(master).connect(context.destination);

    const weights = [1, 0.36 + profile.brightness * 0.22, 0.17 + profile.brightness * 0.25, 0.08 + profile.brightness * 0.2, 0.04 + profile.brightness * 0.14];
    const normalizer = weights.reduce((sum, weight) => sum + weight, 0);
    // Drive the fundamental from the selected written note (clamped to a
    // comfortable range) instead of a fixed 220 Hz, so a bari player hears
    // something in their own register rather than the alto's A3 sketch.
    const fundamentalHz = Math.min(440, Math.max(110, soundingHz));
    weights.forEach((weight, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = fundamentalHz * (index + 1);
      oscillator.detune.value = index > 0 ? (index % 2 === 0 ? 1.5 : -1.5) : 0;
      gain.gain.value = weight / normalizer;
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    });

    setDemoPlaying(id);
    window.setTimeout(() => setDemoPlaying((current) => current === id ? null : current), duration * 1000);
  };

  const startChallenge = () => {
    // Every standard-range note is fair game, including the low pinky-table
    // notes (Bb3-C#4) that a silent `.slice(4)` used to drop from the pool --
    // those are exactly what a beginner needs to drill.
    const pool = SAXOPHONE_FINGERINGS
      .filter((fingering) => includeAltissimoInChallenge || fingering.level !== "Altissimo");
    const next = pool[Math.floor(Math.random() * pool.length)];
    setTrainerMode("challenge");
    setChallenge(next);
    setSelectedIndex(SAXOPHONE_FINGERINGS.indexOf(next));
    setChoiceIndex(0);
    setActiveKeys(new Set());
    setFeedback("idle");
    challengeEvidenceRecordedRef.current = false;
  };

  const recordChallengeEvidence = (correctOnFirstCheck: boolean) => {
    if (!challenge || challengeEvidenceRecordedRef.current) return;
    challengeEvidenceRecordedRef.current = true;
    try {
      const capturedAt = new Date().toISOString();
      const current = parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY));
      const next = withFingeringAttempt(current, {
        id: `fingering-${capturedAt}-${challenge.id}`,
        capturedAt,
        noteId: challenge.id,
        correctOnFirstCheck,
      });
      localStorage.setItem(SKILL_EVIDENCE_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("bocal-skill-evidence"));
    } catch {
      // Challenge play remains available without device storage.
    }
  };

  const showAnswer = () => {
    const answer = challenge ?? selected;
    if (challenge) recordChallengeEvidence(false);
    setChoiceIndex(0);
    setActiveKeys(new Set(answer.keys));
    setFeedback("idle");
  };

  const checkChallenge = () => {
    if (!challenge) return;
    const validChoices = fingeringChoices(challenge);
    const isCorrect = validChoices.some((choice) => sameKeys(activeKeys, choice.keys));
    recordChallengeEvidence(isCorrect);
    setFeedback(isCorrect ? "correct" : "retry");
  };

  const switchToLearn = () => {
    setTrainerMode("learn");
    setChallenge(null);
    setFeedback("idle");
    setActiveKeys(new Set(selectedChoice.keys));
  };

  const selectSetupPart = (partId: SetupPartId) => {
    setSetupPartId(partId);
    const nextPart = SAX_SETUP_PARTS.find((part) => part.id === partId);
    setComparisonIds(nextPart?.variants.slice(0, 2).map((variant) => variant.id) ?? []);
  };

  const toggleComparison = (variantId: string) => {
    setComparisonIds((current) => {
      if (current.includes(variantId)) return current.filter((id) => id !== variantId);
      if (current.length < 2) return [...current, variantId];
      return [current[1], variantId];
    });
  };

  const leftKeys = activeKeyDetails.filter((key) => key.hand === "Left");
  const rightKeys = activeKeyDetails.filter((key) => key.hand === "Right");
  const linkedPadCount = activeKeyDetails.reduce((total, key) => total + SAX_MECHANICS[key.id].linkedPads.length, 0);

  return (
    <div className="sax-lab-view">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Sax lab · {isAlto ? "Detailed interactive alto" : `Fingerings for ${instrument.shortName.toLowerCase()}`}</p>
          <h1>See exactly which keys to press.</h1>
          <p>Pick a written note, or tap a key on the sax. The cyan glow marks each touch point; the panel explains what that key moves.</p>
        </div>
        <div className="lab-mode-controls">
          <div className="lab-mode-switch" aria-label="Trainer mode">
            <button className={trainerMode === "learn" ? "is-active" : ""} onClick={switchToLearn}><Eye size={15} /> Learn</button>
            <button className={trainerMode === "challenge" ? "is-active" : ""} onClick={startChallenge}><Shuffle size={15} /> Challenge</button>
          </div>
          <label className="altissimo-challenge-toggle">
            <input
              type="checkbox"
              checked={includeAltissimoInChallenge}
              onChange={(event) => setIncludeAltissimoInChallenge(event.target.checked)}
            />
            Quiz altissimo too
          </label>
        </div>
      </header>

      {!isAlto && (
        <div className="lab-instrument-notice">
          <Info size={15} />
          <p>
            Fingerings for your {instrument.shortName.toLowerCase()}, shown on an alto. Soprano, alto, tenor and
            baritone read the same written note off the same grip, so the fingerings below are correct for your horn
            — but the 3D model, photos and sound you see and hear here are an alto&apos;s, because that is the only
            saxophone Bocal has a licensed model for. The standard written range (B♭3 to F♯6) is checked on alto —
            those fingerings and alternates can feel or respond differently on {instrument.shortName.toLowerCase()}.
            The altissimo notes (G6 to C7) are unverified for every horn, alto included — see the badge on those
            fingerings.
            {instrumentId === "bari-sax" &&
              " Many baritones also have a low A key (written A3) below this chart's lowest note; it isn't included here."}
          </p>
        </div>
      )}

      <div className="note-browser" aria-label="Written note selector">
        <button className="note-arrow" aria-label="Previous note" onClick={() => chooseNote(selectedIndex - 1)}><ChevronLeft size={18} /></button>
        <div className="note-scroll">
          {SAXOPHONE_FINGERINGS.map((fingering, index) => (
            <Fragment key={fingering.id}>
              {index === firstAltissimoIndex && (
                <span className="note-scroll-divider" aria-hidden="true">Altissimo</span>
              )}
              <button
                className={index === selectedIndex ? "is-active" : ""}
                onClick={() => chooseNote(index)}
                aria-label={`${fingering.note} ${fingering.octave}${fingering.level === "Altissimo" ? ", altissimo, unverified" : ""}`}
              >
                {fingering.note}<sup>{fingering.octave}</sup>
              </button>
            </Fragment>
          ))}
        </div>
        <button className="note-arrow" aria-label="Next note" onClick={() => chooseNote(selectedIndex + 1)}><ChevronRight size={18} /></button>
      </div>

      <div className="reference-model-strip"><span><ShieldCheck size={14} /> Bronze study finish · licensed geometry · key glows aligned on the instrument</span><a href="https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27" target="_blank" rel="noreferrer">Model credit <ExternalLink size={13} /></a></div>

      <div className="lab-workspace">
        <div className={`model-experience-column ${immersive ? "is-immersive" : ""}`}>
          <div className="model-experience-dock">
            <div className="experience-dock-summary"><CircleDot size={15} /><span><strong>Key glow</strong><small>Cyan light marks the touch-pieces used by the selected note.</small></span></div>
            <div className="experience-legend" aria-label="Contact legend">
              <span><i className="legend-touch" /> Press</span>
              <span><i className="legend-pad" /> Available</span>
            </div>
            <div className="experience-dock-actions">
              <button aria-label={`${showGuides ? "Hide" : "Show"} all available fingering targets`} aria-pressed={showGuides} className={showGuides ? "is-active" : ""} onClick={() => setShowGuides((value) => !value)}><Eye size={14} /><span>All touches</span></button>
              <button aria-label="Reset saxophone view" onClick={() => setResetView((value) => value + 1)}><RefreshCw size={14} /><span>Reset</span></button>
              <button aria-label={immersive ? "Exit immersive view" : "Open immersive view"} className={immersive ? "is-active" : ""} onClick={() => setImmersive((value) => !value)}>{immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{immersive ? "Exit" : "Focus"}</span></button>
            </div>
            <div className="experience-view-presets" aria-label="Saxophone view presets">
              {REFERENCE_VIEW_PRESETS.map((preset) => (
                <button key={preset.id} className={referenceViewPreset === preset.id ? "is-active" : ""} aria-pressed={referenceViewPreset === preset.id} onClick={() => setReferenceViewPreset(preset.id)}>{preset.label}</button>
              ))}
            </div>
          </div>
          <section className="model-stage sax-model-stage">
            <ImportedInstrumentCanvas
              src="/models/saxophone-alto.glb"
              label={
                isAlto
                  ? "Detailed interactive three-dimensional alto saxophone with illuminated fingering targets"
                  : `Detailed interactive three-dimensional alto saxophone with illuminated fingering targets, shown as a stand-in for ${instrument.shortName.toLowerCase()}`
              }
              viewPreset={referenceViewPreset}
              resetView={resetView}
              fingeringMarkers={SAX_KEYS}
              activeMarkerIds={activeKeys}
              showFingeringGuides={showGuides}
              onMarkerToggle={(id) => toggleKey(id as SaxKeyId)}
              modelId="saxophone-alto"
              look={look}
            />
            <div className="model-note-badge">
              <small>{trainerMode === "challenge" ? "Build this fingering" : "Written pitch"}</small>
              <strong>{selected.note}<sup>{selected.octave}</sup></strong>
              <span>{selected.level} register</span>
              {selectedChoice.review === "unverified" && <ReviewBadge />}
            </div>
            <div className="model-accuracy-label">Bronze study · key glows aligned to the reference mesh</div>
            <div className="drag-hint"><Rotate3D size={15} /> Drag to orbit</div>
          </section>
          <ModelLookPanel look={look} onChange={updateLook} instrumentKind="saxophone" />
        </div>

        <aside className="fingering-panel">
          {trainerMode === "challenge" ? (
            <div className="challenge-head">
              <span className="panel-kicker"><Sparkles size={14} /> Finger memory</span>
              <h2>Build {selected.note}<sup>{selected.octave}</sup> {selectedChoice.review === "unverified" && <ReviewBadge />}</h2>
              <p>Primary or validated alternate fingerings are accepted.</p>
              {feedback === "correct" && <div className="answer-state correct"><Check size={17} /> That&apos;s it. Clean and correct.</div>}
              {feedback === "retry" && <div className="answer-state retry"><X size={17} /> Not yet. Compare fingertip targets and try once more.</div>}
              <button className="challenge-button" onClick={checkChallenge}><Check size={17} /> Check fingering</button>
              <button className="reveal-button" onClick={showAnswer}><CircleHelp size={15} /> Show primary</button>
            </div>
          ) : (
            <>
              <div className="pitch-pair">
                <div><small>Written</small><strong>{selected.note}<sup>{selected.octave}</sup></strong></div>
                <ArrowRight size={18} />
                <div><small>Concert pitch</small><strong>{midiToName(concertMidi)}</strong></div>
              </div>

              {choices.length > 1 && (
                <div className="fingering-choices" aria-label="Primary and alternate fingerings">
                  <small>Fingering route</small>
                  <div>
                    {choices.map((choice, index) => (
                      <button
                        key={choice.id}
                        className={index === choiceIndex ? "is-active" : ""}
                        onClick={() => chooseChoice(selected, index)}
                      >{choice.label}{choice.review === "unverified" && <i className="choice-review-dot" aria-label="unverified" title="Not checked by a teacher for Bocal" />}</button>
                    ))}
                  </div>
                  {selectedChoice.review === "unverified" && <ReviewBadge />}
                  {selectedChoice.useWhen && <p><Info size={13} /> {selectedChoice.useWhen}</p>}
                </div>
              )}

              <button className="tone-button" onClick={() => void playTone()}><Volume2 size={17} /> Hear {soundingHz.toFixed(1)} Hz</button>
              <div className="finger-hint"><Lightbulb size={16} /><p>{selectedChoice.hint}</p></div>
            </>
          )}

          <div className="pressed-section">
            <div className="pressed-heading"><span>Finger contacts</span><strong>{activeKeys.size}</strong></div>
            <p className="hand-map-note">The main pearls form one front stack: the left hand operates the upper section and the right hand the lower section. Side and palm keys wrap around the tube.</p>
            {activeKeys.size === 0 ? (
              <div className="open-fingering"><CircleDot size={18} /><span>Open fingering</span><small>No player touch-piece is pressed.</small></div>
            ) : (
              <div className="hand-columns">
                <KeyColumn title="Left hand" keys={leftKeys} />
                <KeyColumn title="Right hand" keys={rightKeys} />
              </div>
            )}
          </div>

          {activeKeys.size > 0 && (
            <details className="linked-pad-trace" open>
              <summary><Link2 size={14} /> Linked pad trace <span>{linkedPadCount}</span></summary>
              <div>
                {activeKeyDetails.map((key) => {
                  const mechanic = SAX_MECHANICS[key.id];
                  return (
                    <article key={key.id}>
                      <i>{key.short}</i>
                      <div>
                        <strong>{key.name}</strong>
                        <span>{mechanic.linkedPads.map((pad) => `${pad.motion === "opens" ? "Opens" : "Closes"} ${pad.name}${pad.condition ? ` (${pad.condition})` : ""}`).join(" · ")}</span>
                        <small>{mechanic.explanation}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          )}

          <div className="lab-tip"><Ear size={15} /><span><strong>What you’re seeing.</strong> Cyan marks the keys for this note. Gold rings show other keys you can tap. The movement of linked pads stays in the panel above.</span></div>
          <div className="lab-tip sax-review-tip"><ShieldAlert size={15} /><span><strong>Not checked yet.</strong> The altissimo notes (G6–C7) and the fingerings marked <ReviewBadge /> above are common fingerings drawn from published charts and method books, not fingerings a teacher has checked for Bocal — expect them to vary by horn, mouthpiece and player.</span></div>
        </aside>
      </div>

      <SetupExplorer
        selectedPartId={setupPartId}
        selectedPart={setupPart}
        onPartSelect={selectSetupPart}
        colorway={colorway}
        onColorwaySelect={(id) => updateLook({ bodyFinish: id })}
        comparisonIds={comparisonIds}
        onComparisonToggle={toggleComparison}
        onDemo={(variant) => void playCharacterDemo(variant.id, variant.tone)}
        demoPlaying={demoPlaying}
      />

      <div className="lab-footer-cards">
        <article className="is-fingering"><span><Wind size={16} /> Fingering</span><strong>The key you touch is not always the pad that moves.</strong><p>Cyan sits on the key under your finger. The panel lists the pads that move with it.</p></article>
        <article className="is-setup"><span><Headphones size={16} /> Setup</span><strong>Compare the parts that change feel and response.</strong><p>Manufacturer descriptions are labelled, fit warnings stay visible, and finish colour is treated as visual only.</p></article>
        <article className="is-routes"><span><MousePointer2 size={16} /> Alternate fingerings</span><strong>See the standard route and checked alternatives.</strong><p>Front E and F show the exact touch-pieces used, including the B pad they move.</p></article>
      </div>
      <a className="sax-model-credit" href="https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27" target="_blank" rel="noreferrer">“saxophone alto” by ANDRIANIAINAToky · CC BY 4.0 <ExternalLink size={12} /></a>
    </div>
  );
}

function SetupExplorer({
  selectedPartId,
  selectedPart,
  onPartSelect,
  colorway,
  onColorwaySelect,
  comparisonIds,
  onComparisonToggle,
  onDemo,
  demoPlaying,
}: {
  selectedPartId: SetupPartId;
  selectedPart: (typeof SAX_SETUP_PARTS)[number];
  onPartSelect: (id: SetupPartId) => void;
  colorway: SaxColorway;
  onColorwaySelect: (id: string) => void;
  comparisonIds: string[];
  onComparisonToggle: (id: string) => void;
  onDemo: (variant: SetupVariant) => void;
  demoPlaying: string | null;
}) {
  const compared = useMemo(
    () => selectedPart.variants.filter((variant) => comparisonIds.includes(variant.id)),
    [comparisonIds, selectedPart.variants],
  );
  const [featuredVariantId, setFeaturedVariantId] = useState(selectedPart.variants[0]?.id ?? "");
  const variantRefs = useRef(new Map<string, HTMLElement>());

  const resolvedFeaturedId = selectedPart.variants.some((variant) => variant.id === featuredVariantId)
    ? featuredVariantId
    : selectedPart.variants[0]?.id ?? "";
  const featuredIndex = Math.max(0, selectedPart.variants.findIndex((variant) => variant.id === resolvedFeaturedId));
  const focusVariant = (index: number) => {
    const wrapped = (index + selectedPart.variants.length) % selectedPart.variants.length;
    const variant = selectedPart.variants[wrapped];
    if (!variant) return;
    setFeaturedVariantId(variant.id);
    window.requestAnimationFrame(() => variantRefs.current.get(variant.id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
  };

  return (
    <section className="setup-explorer">
      <header>
        <div>
          <p className="eyebrow">Build your setup</p>
          <h2>Compare the parts that shape your setup.</h2>
          <p>Move from finish to reed, compare two options, and hear a level-matched sound sketch where it helps.</p>
        </div>
        <a href={SETUP_FOUNDATION_SOURCE} target="_blank" rel="noreferrer">Selection foundation <ExternalLink size={13} /></a>
      </header>

      <nav className="setup-part-tabs" aria-label="Saxophone setup parts">
        {SAX_SETUP_PARTS.map((part) => (
          <button key={part.id} className={selectedPartId === part.id ? "is-active" : ""} onClick={() => onPartSelect(part.id)}>
            <span>{part.label}</span><small>{part.shortDescription}</small>
          </button>
        ))}
      </nav>

      <div className="setup-part-intro">
        <div><strong>What it changes</strong><p>{selectedPart.explainer}</p></div>
        <div><Info size={16} /><p>{selectedPart.caveat}</p></div>
      </div>

      {selectedPartId === "finish" ? (
        <div className="finish-grid visual-coverflow" aria-label="Finish coverflow">
          {SAX_COLORWAYS.map((candidate) => (
            <button key={candidate.id} className={candidate.id === colorway.id ? "is-active" : ""} onClick={() => onColorwaySelect(candidate.id)}>
              <span className="finish-visual" style={{ background: `radial-gradient(circle at 64% 24%, ${hexColour(candidate.keyworkLight)} 0 4%, transparent 5%), linear-gradient(135deg, ${hexColour(candidate.body)} 0 58%, ${hexColour(candidate.keyworkLight)} 59%)` }}><i /><b /></span>
              <div><strong>{candidate.name}</strong><small>{candidate.description}</small></div>
              {candidate.id === colorway.id && <Check size={16} />}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="compare-status">
            <span><AudioLines size={15} /> A/B comparison</span>
            <p>{compared.length === 2 ? `${compared[0].name} vs ${compared[1].name}` : "Select two variants to compare."}</p>
            <small>Bars are directional summaries, not measurements.</small>
          </div>
          <div className="coverflow-heading">
            <div><strong>{selectedPart.variants[featuredIndex]?.name}</strong><span>{featuredIndex + 1} / {selectedPart.variants.length}</span></div>
            <div><button aria-label="Previous variant" onClick={() => focusVariant(featuredIndex - 1)}><ChevronLeft size={16} /></button><button aria-label="Next variant" onClick={() => focusVariant(featuredIndex + 1)}><ChevronRight size={16} /></button></div>
          </div>
          <div className="variant-grid visual-coverflow" role="list" aria-label={`${selectedPart.label} variants`}>
            {selectedPart.variants.map((variant, index) => (
              <SetupVariantCard
                key={variant.id}
                variant={variant}
                partId={selectedPartId}
                index={index}
                total={selectedPart.variants.length}
                featured={variant.id === resolvedFeaturedId}
                deckOffset={index - featuredIndex}
                cardRef={(node) => { if (node) variantRefs.current.set(variant.id, node); else variantRefs.current.delete(variant.id); }}
                onFocus={() => setFeaturedVariantId(variant.id)}
                selected={comparisonIds.includes(variant.id)}
                onToggle={() => onComparisonToggle(variant.id)}
                onDemo={() => onDemo(variant)}
                playing={demoPlaying === variant.id}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SetupVariantCard({
  variant,
  partId,
  index,
  total,
  featured,
  deckOffset,
  cardRef,
  onFocus,
  selected,
  onToggle,
  onDemo,
  playing,
}: {
  variant: SetupVariant;
  partId: SetupPartId;
  index: number;
  total: number;
  featured: boolean;
  deckOffset: number;
  cardRef: (node: HTMLElement | null) => void;
  onFocus: () => void;
  selected: boolean;
  onToggle: () => void;
  onDemo: () => void;
  playing: boolean;
}) {
  return (
    <article
      ref={cardRef}
      role="listitem"
      className={`variant-card ${selected ? "is-compared" : ""} ${featured ? "is-featured" : ""}`}
      style={{ "--coverflow-offset": deckOffset } as CSSProperties}
      onClick={onFocus}
      onFocusCapture={onFocus}
    >
      <div className={`variant-visual variant-visual-${partId}`} aria-hidden="true">
        <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        <div className="variant-visual-glow" />
        <div className="variant-part-object"><i /><i /><b /></div>
      </div>
      <header>
        <div><small>{variant.eyebrow}</small><h3>{variant.name}</h3></div>
        <button className="compare-toggle" onClick={onToggle} aria-pressed={selected}>{selected ? <Check size={14} /> : "+"} {selected ? "Comparing" : "Compare"}</button>
      </header>
      <p>{variant.summary}</p>
      {variant.facts && <ul>{variant.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
      <div className="attribute-stack">
        {variant.attributes.map((attribute) => (
          <div className="attribute-row" key={attribute.label}>
            <div><strong>{attribute.label}</strong><span>{attribute.low}</span><span>{attribute.high}</span></div>
            <i><b style={{ width: `${attribute.value}%` }} /></i>
          </div>
        ))}
      </div>
      <div className="variant-use"><Lightbulb size={14} /><p>{variant.useCase}</p></div>
      <footer>
        <button onClick={onDemo}><Volume2 size={14} /> {playing ? "Playing…" : "Illustrative demo"}</button>
        <a href={variant.sourceUrl} target="_blank" rel="noreferrer">{variant.evidence} <ExternalLink size={11} /></a>
      </footer>
    </article>
  );
}

function KeyColumn({ title, keys }: { title: string; keys: typeof SAX_KEYS }) {
  return (
    <div className="key-column">
      <small>{title}</small>
      {keys.length === 0 ? <span className="no-key">—</span> : keys.map((key) => (
        <div className="key-chip" key={key.id}><i>{key.short}</i><span>{key.name}<small>{key.finger}</small></span></div>
      ))}
    </div>
  );
}
