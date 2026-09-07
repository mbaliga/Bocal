"use client";

import {
  Activity,
  ArrowRight,
  BellRing,
  Clock3,
  Headphones,
  ListMusic,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Save,
  TrendingUp,
  Volume2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { noteName } from "./notation";
import {
  cycleBeatMark,
  defaultAccentPattern,
  resizeAccentPattern,
  schedulePolyrhythm,
  schedulePulse,
  type BeatMark,
  type ClickVoice,
  type PolyrhythmVoice,
  type PulsePlan,
  type PulseSegment,
} from "./pulse-schedule";
import { recordPracticeActivity } from "./practice-data";
import {
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  withRhythmAttempt,
} from "./skill-rating";
import { targetHzFor, type TuningOptions } from "./tuning";
import "./styles/pulse.css";

// The Android/WebView host contract (see PLAN.md "Shared conventions" §6).
// Declared locally rather than in a shared d.ts because no such file exists
// yet in this codebase; harmless to redeclare an optional global.
declare global {
  interface Window {
    bocalHost?: {
      setTheme?(theme: "light" | "dark"): void;
      setKeepAwake?(on: boolean): void;
      saveFile?(name: string, mime: string, base64: string): boolean;
      openExternal?(url: string): boolean;
    };
  }
}

const EQUAL_A440: TuningOptions = { referenceHz: 440, temperament: "equal", keyPc: 0 };
const DRONE_OCTAVES = [2, 3, 4, 5];

type MetronomePreset = {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  subdivision: number;
  voice: ClickVoice;
  countInBars: number;
  muteEveryBars: number;
  accentPattern: BeatMark[];
  /** A preset may carry its own ramp, so a sequence step built from it can accelerate too. */
  rampToBpm?: number;
  rampBars?: number;
};
const METRONOME_PRESETS_KEY = "bocal-metronome-presets-v1";
const DEFAULT_METRONOME_PRESETS: MetronomePreset[] = [
  { id: "straight-4", name: "Straight 4/4", bpm: 92, beatsPerBar: 4, subdivision: 1, voice: "pure", countInBars: 1, muteEveryBars: 0, accentPattern: defaultAccentPattern(4) },
  { id: "slow-landing", name: "Slow landing", bpm: 56, beatsPerBar: 4, subdivision: 2, voice: "wood", countInBars: 2, muteEveryBars: 0, accentPattern: defaultAccentPattern(4) },
  { id: "silent-bar", name: "Silent bar", bpm: 80, beatsPerBar: 4, subdivision: 1, voice: "clave", countInBars: 1, muteEveryBars: 4, accentPattern: defaultAccentPattern(4) },
  { id: "gentle-ramp", name: "Gentle ramp", bpm: 70, beatsPerBar: 4, subdivision: 1, voice: "pure", countInBars: 1, muteEveryBars: 0, accentPattern: defaultAccentPattern(4), rampToBpm: 100, rampBars: 8 },
];

const METER_CHOICES = [2, 3, 4, 5, 6, 7, 9, 12];
const COMPOUND_METERS = new Set([6, 9, 12]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBeatMark(value: unknown): value is BeatMark {
  return value === "normal" || value === "accent" || value === "silent";
}

function isClickVoice(value: unknown): value is ClickVoice {
  return value === "pure" || value === "wood" || value === "beep" || value === "clave";
}

/** Fills in accentPattern for presets saved before it existed, and keeps it sized to the meter. Drops a corrupt entry entirely rather than guessing at it. */
function sanitizePreset(preset: unknown): MetronomePreset | null {
  if (!preset || typeof preset !== "object") return null;
  const candidate = preset as Partial<MetronomePreset>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;
  const beatsPerBar = isFiniteNumber(candidate.beatsPerBar) && candidate.beatsPerBar >= 1 ? Math.round(candidate.beatsPerBar) : 4;
  const bpm = isFiniteNumber(candidate.bpm) && candidate.bpm > 0 ? Math.min(260, Math.max(35, candidate.bpm)) : 92;
  const subdivision = isFiniteNumber(candidate.subdivision) && candidate.subdivision >= 1 ? Math.round(candidate.subdivision) : 1;
  const voice = isClickVoice(candidate.voice) ? candidate.voice : "pure";
  const countInBars = isFiniteNumber(candidate.countInBars) && candidate.countInBars >= 0 ? Math.round(candidate.countInBars) : 0;
  const muteEveryBars = isFiniteNumber(candidate.muteEveryBars) && candidate.muteEveryBars >= 0 ? Math.round(candidate.muteEveryBars) : 0;
  const pattern = Array.isArray(candidate.accentPattern) && candidate.accentPattern.every(isBeatMark) && candidate.accentPattern.length > 0
    ? candidate.accentPattern
    : defaultAccentPattern(beatsPerBar);
  const rampToBpm = isFiniteNumber(candidate.rampToBpm) ? Math.min(260, Math.max(35, candidate.rampToBpm)) : undefined;
  const rampBars = isFiniteNumber(candidate.rampBars) && candidate.rampBars >= 2 ? Math.round(candidate.rampBars) : undefined;
  return {
    id: candidate.id,
    name: candidate.name.slice(0, 36),
    bpm,
    beatsPerBar,
    subdivision,
    voice,
    countInBars,
    muteEveryBars,
    accentPattern: resizeAccentPattern(pattern, beatsPerBar),
    ...(rampToBpm !== undefined && rampBars !== undefined ? { rampToBpm, rampBars } : {}),
  };
}

/** A named, ordered chain of saved presets -- Bocal's answer to TE's preset sequences. */
type MetronomeSequenceStep = { presetId: string; bars: number };
type MetronomeSequence = { id: string; name: string; steps: MetronomeSequenceStep[]; loop: boolean };
const METRONOME_SEQUENCES_KEY = "bocal-metronome-sequences-v1";

/** Drops an unusable sequence (missing name/steps) rather than letting a bad entry reach render, where `.steps.map` would throw. */
function sanitizeSequence(value: unknown): MetronomeSequence | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MetronomeSequence>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;
  if (!Array.isArray(candidate.steps)) return null;
  const steps = candidate.steps
    .filter((step): step is MetronomeSequenceStep =>
      Boolean(step) && typeof step === "object" && typeof (step as MetronomeSequenceStep).presetId === "string" && isFiniteNumber((step as MetronomeSequenceStep).bars))
    .map((step) => ({ presetId: step.presetId, bars: Math.min(64, Math.max(1, Math.round(step.bars))) }))
    .slice(0, 24);
  if (steps.length === 0) return null;
  return { id: candidate.id, name: candidate.name.slice(0, 36), steps, loop: candidate.loop === true };
}

function audioClick(context: AudioContext, destination: AudioNode, accent: boolean, subdivision: boolean, when: number, voice: ClickVoice, countIn: boolean) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  if (countIn) {
    // A distinct, quieter voice for count-in ticks so they read as "getting
    // ready" rather than the click the player is meant to play with -- and
    // so a player who only half-listens still hears the difference.
    oscillator.type = "triangle";
    oscillator.frequency.value = accent ? 500 : 380;
    gain.gain.setValueAtTime(0.045, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  } else {
    const settings: Record<ClickVoice, { type: OscillatorType; accent: number; beat: number; sub: number }> = {
      pure: { type: "sine", accent: 1320, beat: 880, sub: 560 },
      wood: { type: "triangle", accent: 980, beat: 700, sub: 430 },
      beep: { type: "square", accent: 1480, beat: 920, sub: 620 },
      clave: { type: "sawtooth", accent: 1180, beat: 820, sub: 500 },
    };
    const selected = settings[voice];
    oscillator.type = selected.type;
    oscillator.frequency.value = accent ? selected.accent : subdivision ? selected.sub : selected.beat;
    gain.gain.setValueAtTime(subdivision ? 0.035 : 0.08, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + (subdivision ? 0.03 : 0.06));
  }
  oscillator.connect(gain).connect(destination);
  oscillator.start(when);
  oscillator.stop(when + 0.07);
}

/** The second-voice polyrhythm click: a different timbre from the main click so the two voices stay distinguishable by ear. */
function audioPolyClick(context: AudioContext, destination: AudioNode, when: number, voice: ClickVoice) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = voice === "beep" ? 1760 : 1040;
  gain.gain.setValueAtTime(0.05, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  oscillator.connect(gain).connect(destination);
  oscillator.start(when);
  oscillator.stop(when + 0.06);
}

/** How far ahead of the audio clock clicks are queued. Raised on a hidden tab so throttled timers still keep the queue full. */
const SCHEDULE_AHEAD_VISIBLE = 0.12;
const SCHEDULE_AHEAD_HIDDEN = 1.5;
/** How often the scheduler wakes to top up the queue. */
const SCHEDULER_TICK_MS = 25;

export function PulseView({ tuningOptions = EQUAL_A440 }: { tuningOptions?: TuningOptions }) {
  const [bpm, setBpm] = useState(92);
  const [playing, setPlaying] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [meterDenominator, setMeterDenominator] = useState<4 | 8>(4);
  const [subdivision, setSubdivision] = useState(1);
  const [swingRatio, setSwingRatio] = useState(0.5);
  const [clickVoice, setClickVoice] = useState<ClickVoice>("pure");
  const [countInBars, setCountInBars] = useState(1);
  const [muteEveryBars, setMuteEveryBars] = useState(0);
  const [accentPattern, setAccentPattern] = useState<BeatMark[]>(() => defaultAccentPattern(4));
  const [rampEnabled, setRampEnabled] = useState(false);
  const [rampToBpm, setRampToBpm] = useState(132);
  const [rampBars, setRampBars] = useState(4);
  const [polyrhythm, setPolyrhythm] = useState<"off" | "3:2" | "4:3">("off");
  const [presets, setPresets] = useState<MetronomePreset[]>(() => {
    if (typeof window === "undefined") return DEFAULT_METRONOME_PRESETS;
    try {
      const saved = JSON.parse(localStorage.getItem(METRONOME_PRESETS_KEY) ?? "null");
      const custom = Array.isArray(saved) ? saved.map((item) => sanitizePreset(item)).filter((item): item is MetronomePreset => item !== null) : [];
      return [...DEFAULT_METRONOME_PRESETS, ...custom].slice(0, 12);
    } catch { return DEFAULT_METRONOME_PRESETS; }
  });
  const [presetName, setPresetName] = useState("");
  const [sequences, setSequences] = useState<MetronomeSequence[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(localStorage.getItem(METRONOME_SEQUENCES_KEY) ?? "null");
      return Array.isArray(saved) ? saved.map(sanitizeSequence).filter((item): item is MetronomeSequence => item !== null).slice(0, 9) : [];
    } catch { return []; }
  });
  const [activeSequence, setActiveSequence] = useState<MetronomeSequence | null>(null);
  const [activeSequenceStep, setActiveSequenceStep] = useState(0);
  const [sequenceDraft, setSequenceDraft] = useState<MetronomeSequenceStep[]>([]);
  const [draftPresetId, setDraftPresetId] = useState(DEFAULT_METRONOME_PRESETS[0].id);
  const [draftBars, setDraftBars] = useState(4);
  const [draftLoop, setDraftLoop] = useState(false);
  const [sequenceName, setSequenceName] = useState("");
  const [currentBeat, setCurrentBeat] = useState(0);
  const [haptics, setHaptics] = useState(false);
  const [droneOn, setDroneOn] = useState(false);
  const [dronePc, setDronePc] = useState(10); // B♭, the woodwind player's usual concert pitch
  const [droneOctave, setDroneOctave] = useState(3);
  const [liveBpm, setLiveBpm] = useState(bpm);
  const [liveMeter, setLiveMeter] = useState<{ beatsPerBar: number; accentPattern: BeatMark[] } | null>(null);
  const [countInInfo, setCountInInfo] = useState<{ bar: number; total: number } | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const contextRef = useRef<AudioContext | null>(null);
  const tapsRef = useRef<number[]>([]);
  /** Audio-clock time of tick 0 for the current run; null when stopped. */
  const startAudioTimeRef = useRef<number | null>(null);
  /** Audio-clock time of every beat scheduled so far in this run (subdivision ticks excluded), newest last. */
  const scheduledBeatTimesRef = useRef<number[]>([]);
  /** Estimate of the next, not-yet-queued beat -- taps that lead the queue by
   *  more than SCHEDULE_AHEAD would otherwise only find the *previous* beat
   *  as a candidate and be graded against the wrong one. */
  const nextBeatEstimateRef = useRef<{ when: number; bpmNow: number } | null>(null);
  const hapticsRef = useRef(false);
  const rhythmErrorsRef = useRef<number[]>([]);
  const [rhythmTapCount, setRhythmTapCount] = useState(0);
  const [rhythmFeedback, setRhythmFeedback] = useState("");
  /** The live (non-sequence) segment object the running scheduler reads from every bar; mutating .bpm here lets the tempo change mid-run without restarting the generator and glitching the phase. */
  const liveSegmentRef = useRef<PulseSegment | null>(null);
  const presetsByIdRef = useRef<Map<string, MetronomePreset>>(new Map());
  const playedSecondsRef = useRef(0);

  // Presets referenced by id so a sequence step can pull its full settings.
  const presetsById = useMemo(() => new Map(presets.map((preset) => [preset.id, preset])), [presets]);
  useEffect(() => { presetsByIdRef.current = presetsById; }, [presetsById]);
  // Signatures, not the arrays/objects themselves, so an unrelated re-render
  // (a new array identity with the same content) doesn't restart the
  // scheduler underneath a run in progress.
  const accentSignature = accentPattern.join(",");
  const sequenceSignature = activeSequence ? `${activeSequence.id}:${activeSequence.loop}:${activeSequence.steps.map((step) => `${step.presetId}x${step.bars}`).join(",")}` : "";
  const polySpec: PolyrhythmVoice | null = polyrhythm === "3:2" ? { beats: 2, voice: "beep" } : polyrhythm === "4:3" ? { beats: 3, voice: "beep" } : null;

  useEffect(() => {
    if (!playing) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    void context.resume();

    // Build this run's plan once, up front. A tempo ramp or a preset
    // sequence both live entirely *inside* the plan -- schedulePulse()
    // carries the audio-clock time forward tick by tick from the plan, so
    // neither a ramp bar nor a sequence step needs this effect to restart
    // (which would reset phase and glitch). The effect only restarts when a
    // setting actually changes, and none of the settings below change on
    // their own mid-run: bpm stays a live-mutated ref (see liveSegmentRef)
    // so tempo nudges apply at the next bar instead of restarting, and
    // liveBpm/liveMeter (which do change every tick, for the readout and the
    // beat lights) are deliberately not in this effect's dependency list.
    let plan: PulsePlan;
    if (activeSequence) {
      liveSegmentRef.current = null;
      const byId = presetsByIdRef.current;
      plan = {
        loop: activeSequence.loop,
        segments: activeSequence.steps
          .map((step) => byId.get(step.presetId))
          .filter((preset): preset is MetronomePreset => Boolean(preset))
          .map((preset, index): PulseSegment => ({
            bpm: preset.bpm,
            beatsPerBar: preset.beatsPerBar,
            subdivision: preset.subdivision,
            voice: preset.voice,
            countInBars: preset.countInBars,
            muteEveryBars: preset.muteEveryBars,
            accentPattern: preset.accentPattern,
            bars: activeSequence.steps[index].bars,
            rampToBpm: preset.rampToBpm,
            label: preset.name,
          })),
      };
    } else {
      const segment: PulseSegment = {
        bpm,
        beatsPerBar,
        subdivision,
        voice: clickVoice,
        countInBars,
        muteEveryBars,
        accentPattern,
        swingRatio,
        bars: rampEnabled ? rampBars : undefined,
        rampToBpm: rampEnabled ? rampToBpm : undefined,
      };
      liveSegmentRef.current = segment;
      plan = { loop: false, segments: [segment] };
    }
    if (plan.segments.length === 0) {
      setPlaying(false);
      setPlanMessage("This sequence points at presets that no longer exist -- add steps back or pick another one.");
      return;
    }
    setPlanMessage("");

    // The metronome runs on the audio clock, not on setInterval. A timer
    // callback is only accurate to a handful of milliseconds and drifts
    // steadily under load, in a background tab, or on a throttled phone --
    // which is exactly the tool a player is using to judge whether *they* are
    // drifting. Instead the scheduler wakes often, queues every click due in
    // the next fraction of a second at an exact audio-clock time, and the
    // audio hardware plays them on the sample. Only the on-screen beat dot
    // and the haptic pulse ride a plain timer, where a few milliseconds of
    // jitter is invisible.
    //
    // Every click for this run is routed through one master gain node so
    // pausing (or a setting that restarts this effect) can silence anything
    // already queued in the look-ahead window by disconnecting it, instead
    // of letting up to SCHEDULE_AHEAD seconds of already-started oscillators
    // ring out into the next state.
    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    const startTime = context.currentTime + 0.06;
    startAudioTimeRef.current = startTime;
    scheduledBeatTimesRef.current = [];
    nextBeatEstimateRef.current = null;
    const iterator = schedulePulse(plan, startTime);
    let pending = iterator.next();
    const polyIterator = polySpec && !activeSequence ? schedulePolyrhythm(beatsPerBar, polySpec, startTime, () => liveSegmentRef.current?.bpm ?? bpm) : null;
    let pendingPoly = polyIterator ? polyIterator.next() : null;
    const visualTimers: number[] = [];
    let scheduleAhead = document.hidden ? SCHEDULE_AHEAD_HIDDEN : SCHEDULE_AHEAD_VISIBLE;

    const schedule = () => {
      while (!pending.done && pending.value.when < context.currentTime + scheduleAhead) {
        const tick = pending.value;
        if (!tick.silent) audioClick(context, masterGain, tick.accent, tick.subTick !== 0, tick.when, tick.voice, tick.countIn);
        if (tick.subTick === 0) {
          const beatTimes = scheduledBeatTimesRef.current;
          beatTimes.push(tick.when);
          if (beatTimes.length > 64) beatTimes.shift();
          nextBeatEstimateRef.current = { when: tick.when + 60 / tick.bpmNow, bpmNow: tick.bpmNow };
          visualTimers.push(
            window.setTimeout(
              () => {
                setCurrentBeat(tick.beat);
                setLiveBpm(tick.bpmNow);
                const segment = plan.segments[tick.segmentIndex] ?? plan.segments[plan.segments.length - 1];
                setLiveMeter({ beatsPerBar: tick.beatsPerBar, accentPattern: resizeAccentPattern(segment.accentPattern, tick.beatsPerBar) });
                setActiveSequenceStep(tick.segmentIndex);
                setCountInInfo(tick.countIn ? { bar: tick.barInSegment + 1, total: segment.countInBars } : null);
                playedSecondsRef.current += 60 / tick.bpmNow;
                if (hapticsRef.current && navigator.vibrate && !tick.silent) navigator.vibrate(tick.accent ? 28 : 14);
              },
              Math.max(0, (tick.when - context.currentTime) * 1000),
            ),
          );
        }
        pending = iterator.next();
      }
      while (polyIterator && pendingPoly && !pendingPoly.done && pendingPoly.value.when < context.currentTime + scheduleAhead) {
        audioPolyClick(context, masterGain, pendingPoly.value.when, pendingPoly.value.voice);
        pendingPoly = polyIterator.next();
      }
    };
    const onVisibility = () => { scheduleAhead = document.hidden ? SCHEDULE_AHEAD_HIDDEN : SCHEDULE_AHEAD_VISIBLE; };
    document.addEventListener("visibilitychange", onVisibility);

    schedule();
    const timer = window.setInterval(schedule, SCHEDULER_TICK_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      visualTimers.forEach(window.clearTimeout);
      masterGain.disconnect();
      startAudioTimeRef.current = null;
      scheduledBeatTimesRef.current = [];
      nextBeatEstimateRef.current = null;
      setCountInInfo(null);
      if (playedSecondsRef.current > 1) {
        recordPracticeActivity({ type: "rhythm", seconds: playedSecondsRef.current, label: activeSequence ? activeSequence.name : "Metronome" });
      }
      playedSecondsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- accentSignature/sequenceSignature stand in for accentPattern/activeSequence, and bpm is deliberately excluded: a running bpm change goes through liveSegmentRef instead of restarting.
  }, [beatsPerBar, clickVoice, countInBars, muteEveryBars, playing, subdivision, swingRatio, accentSignature, rampEnabled, rampToBpm, rampBars, sequenceSignature, polyrhythm]);

  // The context idles (no click, no drone) between runs rather than staying
  // "running" and holding the audio thread hot the whole time the workspace
  // is open.
  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;
    if (!playing && !droneOn) void context.suspend();
  }, [playing, droneOn]);

  useEffect(() => () => { void contextRef.current?.close(); contextRef.current = null; }, []);

  // Keep the screen on while the click or drone is actually sounding -- a
  // player's hands are on the instrument, not the phone, so the metronome
  // is the one workspace where a screen timeout silently ends the session
  // (see metronome.md "the click stops when the screen locks"). This flag
  // only affects the *screen*: the click itself keeps playing in the
  // background once queued (a backgrounded tab still runs timers, just less
  // often, and the raised look-ahead above covers that), it just becomes
  // inaudible-feeling without haptics/vibration, which do not fire while
  // hidden. Microphone capture elsewhere in the app still stops when
  // backgrounded/locked -- that trade-off is unchanged by this file.
  useEffect(() => {
    window.bocalHost?.setKeepAwake?.(playing || droneOn);
    return () => { window.bocalHost?.setKeepAwake?.(false); };
  }, [playing, droneOn]);

  useEffect(() => {
    if (!droneOn) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    void context.resume();
    const fundamental = context.createOscillator();
    const upper = context.createOscillator();
    const gain = context.createGain();
    const upperGain = context.createGain();
    fundamental.type = "sine";
    upper.type = "sine";
    const droneHz = targetHzFor(dronePc + (droneOctave + 1) * 12, tuningOptions);
    fundamental.frequency.value = droneHz;
    upper.frequency.value = droneHz * 2;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.2);
    upperGain.gain.setValueAtTime(0.0001, context.currentTime);
    upperGain.gain.exponentialRampToValueAtTime(0.017, context.currentTime + 0.2);
    fundamental.connect(gain).connect(context.destination);
    upper.connect(upperGain).connect(context.destination);
    fundamental.start(); upper.start();
    return () => {
      const now = context.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      upperGain.gain.setValueAtTime(upperGain.gain.value, now);
      upperGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      window.setTimeout(() => { fundamental.stop(); upper.stop(); }, 90);
    };
  }, [dronePc, droneOctave, droneOn, tuningOptions]);

  // Toggling haptics must not restart the click scheduler, so the flag is read
  // through a ref rather than captured in the effect's dependency list.
  useEffect(() => { hapticsRef.current = haptics; }, [haptics]);

  const tapTempo = () => {
    // eslint-disable-next-line react-hooks/purity -- tapTempo only ever runs from the tap-tempo button's click handler, never during render; the lint rule's static call-graph heuristic can't see that here.
    const now = performance.now();
    const recent = [...tapsRef.current.filter((tap) => now - tap < 2400), now].slice(-5);
    tapsRef.current = recent;
    if (recent.length > 1) {
      const intervals = recent.slice(1).map((tap, index) => tap - recent[index]);
      const next = Math.round(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
      if (next >= 35 && next <= 260) setBpmLive(next);
    }
  };

  const tapWithPulse = () => {
    // Measured against the audio clock the clicks were scheduled on, not
    // against when the screen last updated, and against every candidate beat
    // including the *next* one still waiting to be queued -- a tap that
    // leads the queue by more than the look-ahead window used to only find
    // the previous beat as a candidate, inflating its error by up to a full
    // beat. Also corrected for the audio pipeline's own output latency,
    // where present, so the number reflects the player's timing rather than
    // the device's.
    const context = contextRef.current;
    const startTime = startAudioTimeRef.current;
    const beatTimes = scheduledBeatTimesRef.current;
    if (!context || startTime === null || beatTimes.length === 0) return;
    const latency = context.outputLatency ?? context.baseLatency ?? 0;
    const tapAt = context.currentTime - latency;
    const candidates = [...beatTimes];
    const nextBeat = nextBeatEstimateRef.current;
    if (nextBeat) candidates.push(nextBeat.when);
    let error = Math.abs(tapAt - candidates[0]);
    for (const when of candidates) {
      const diff = Math.abs(tapAt - when);
      if (diff < error) error = diff;
    }
    const errorMs = error * 1000;
    const nextErrors = [...rhythmErrorsRef.current, errorMs].slice(-16);
    rhythmErrorsRef.current = nextErrors;
    setRhythmTapCount(nextErrors.length);
    if (nextErrors.length < 16) return;

    const ordered = [...nextErrors].sort((left, right) => left - right);
    const medianError = (ordered[7] + ordered[8]) / 2;
    try {
      const capturedAt = new Date().toISOString();
      const current = parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY));
      const next = withRhythmAttempt(current, {
        id: `rhythm-${capturedAt}`,
        capturedAt,
        hitCount: 16,
        medianAbsoluteErrorMs: Number(medianError.toFixed(2)),
      });
      localStorage.setItem(SKILL_EVIDENCE_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("bocal-skill-evidence"));
      setRhythmFeedback(`Saved 16 taps · ${Math.round(medianError)} ms median timing error.`);
      recordPracticeActivity({ type: "rhythm", seconds: (60 / liveBpm) * 16, label: "Pulse accuracy" });
    } catch {
      setRhythmFeedback(`Measured ${Math.round(medianError)} ms median timing error; device storage is unavailable.`);
    }
    rhythmErrorsRef.current = [];
    setRhythmTapCount(0);
  };

  const handleTap = () => playing ? tapWithPulse() : tapTempo();
  const togglePlaying = () => {
    if (!playing) {
      rhythmErrorsRef.current = [];
      setRhythmTapCount(0);
      setRhythmFeedback("Tap with the pulse 16 times to add measured rhythm evidence.");
      setLiveBpm(bpm);
      setLiveMeter(null);
      setActiveSequenceStep(0);
    } else {
      startAudioTimeRef.current = null;
    }
    setPlaying((value) => !value);
  };

  /** Updates the bpm state (for the slider/readout) and, while a plain run is
   *  live, mutates the scheduler's own segment object so the new tempo takes
   *  effect at the next bar instead of restarting the generator. */
  const setBpmLive = (next: number) => {
    setBpm(next);
    if (liveSegmentRef.current && !rampEnabled) liveSegmentRef.current.bpm = next;
  };

  const displayBpm = playing ? Math.round(liveBpm) : bpm;
  const displayBeatsPerBar = playing && liveMeter ? liveMeter.beatsPerBar : beatsPerBar;
  const displayAccentPattern = playing && liveMeter ? liveMeter.accentPattern : accentPattern;
  const tempoName = displayBpm < 60 ? "Largo" : displayBpm < 76 ? "Adagio" : displayBpm < 108 ? "Andante" : displayBpm < 120 ? "Moderato" : displayBpm < 168 ? "Allegro" : "Presto";
  const resetMetronome = () => {
    setBpm(92); setSubdivision(1); setBeatsPerBar(4); setMeterDenominator(4); setSwingRatio(0.5); setClickVoice("pure"); setCountInBars(1); setMuteEveryBars(0);
    setAccentPattern(defaultAccentPattern(4)); setRampEnabled(false); setRampToBpm(132); setRampBars(4); setPolyrhythm("off");
    setActiveSequence(null);
  };
  const changeBeatsPerBar = (count: number) => {
    setBeatsPerBar(count);
    setAccentPattern((current) => resizeAccentPattern(current, count));
    setMeterDenominator(COMPOUND_METERS.has(count) ? 8 : 4);
  };
  const choosePolyrhythm = (choice: "off" | "3:2" | "4:3") => {
    setPolyrhythm(choice);
    if (choice === "3:2") changeBeatsPerBar(3);
    if (choice === "4:3") changeBeatsPerBar(4);
  };
  const toggleAccentMark = (index: number) => {
    setAccentPattern((current) => current.map((mark, position) => (position === index ? cycleBeatMark(mark) : mark)));
  };
  const applyPreset = (preset: MetronomePreset) => {
    setBpm(preset.bpm); setBeatsPerBar(preset.beatsPerBar); setSubdivision(preset.subdivision);
    setClickVoice(preset.voice); setCountInBars(preset.countInBars); setMuteEveryBars(preset.muteEveryBars);
    setAccentPattern(resizeAccentPattern(preset.accentPattern, preset.beatsPerBar));
    setMeterDenominator(COMPOUND_METERS.has(preset.beatsPerBar) ? 8 : 4);
    setRampEnabled(preset.rampToBpm !== undefined && preset.rampBars !== undefined);
    if (preset.rampToBpm !== undefined) setRampToBpm(preset.rampToBpm);
    if (preset.rampBars !== undefined) setRampBars(preset.rampBars);
    setPolyrhythm("off");
    setActiveSequence(null);
  };
  const savePreset = () => {
    const name = presetName.trim().replace(/\s+/g, " ").slice(0, 36);
    if (!name) return;
    const preset: MetronomePreset = {
      id: `preset-${Date.now()}`, name, bpm, beatsPerBar, subdivision, voice: clickVoice, countInBars, muteEveryBars, accentPattern,
      ...(rampEnabled ? { rampToBpm, rampBars } : {}),
    };
    const custom = [...presets.filter((item) => !DEFAULT_METRONOME_PRESETS.some((defaultPreset) => defaultPreset.id === item.id)), preset].slice(-9);
    setPresets([...DEFAULT_METRONOME_PRESETS, ...custom]);
    setPresetName("");
    try { localStorage.setItem(METRONOME_PRESETS_KEY, JSON.stringify(custom)); } catch { /* Optional local preset storage. */ }
  };
  const deletePreset = (id: string) => {
    const custom = presets.filter((item) => item.id !== id && !DEFAULT_METRONOME_PRESETS.some((defaultPreset) => defaultPreset.id === item.id));
    setPresets([...DEFAULT_METRONOME_PRESETS, ...custom]);
    try { localStorage.setItem(METRONOME_PRESETS_KEY, JSON.stringify(custom)); } catch { /* Optional local preset storage. */ }
  };

  const addSequenceStep = () => {
    if (!draftPresetId) return;
    setSequenceDraft((current) => [...current, { presetId: draftPresetId, bars: draftBars }].slice(0, 12));
  };
  const removeSequenceStep = (index: number) => {
    setSequenceDraft((current) => current.filter((_, position) => position !== index));
  };
  const saveSequence = () => {
    const name = sequenceName.trim().replace(/\s+/g, " ").slice(0, 36);
    if (!name || sequenceDraft.length === 0) return;
    const sequence: MetronomeSequence = { id: `sequence-${Date.now()}`, name, steps: sequenceDraft, loop: draftLoop };
    const next = [...sequences, sequence].slice(-9);
    setSequences(next);
    setSequenceName("");
    setSequenceDraft([]);
    setDraftLoop(false);
    try { localStorage.setItem(METRONOME_SEQUENCES_KEY, JSON.stringify(next)); } catch { /* Optional local sequence storage. */ }
  };
  const deleteSequence = (id: string) => {
    const next = sequences.filter((sequence) => sequence.id !== id);
    setSequences(next);
    if (activeSequence?.id === id) { setActiveSequence(null); setPlaying(false); }
    try { localStorage.setItem(METRONOME_SEQUENCES_KEY, JSON.stringify(next)); } catch { /* Optional local sequence storage. */ }
  };
  const playSequence = (sequence: MetronomeSequence) => {
    setActiveSequence(sequence);
    setActiveSequenceStep(0);
    setPolyrhythm("off");
  };
  const clearSequence = () => setActiveSequence(null);

  const droneHz = Math.round(targetHzFor(dronePc + (droneOctave + 1) * 12, tuningOptions) * 10) / 10;

  return (
    <div className="content-wrap pulse-view">
      <section className="section-heading">
        <div><p className="eyebrow">Pulse · Metronome</p><h1>Set the pulse.</h1><p>Adjust the tempo, meter and subdivision, ramp the tempo, accent or silence a beat, or chain presets into a routine.</p></div>
        <div className={`live-badge ${playing ? "metronome-live" : ""}`}><span className={playing ? "pulse-dot" : "quiet-dot"} /> {playing ? "In motion" : "Ready"}</div>
      </section>

      {planMessage && <p className="pulse-plan-message" role="status">{planMessage}</p>}

      <div className="pulse-grid">
        <section className="metronome-card">
          <div className="metronome-top"><span><Waves size={15} /> {tempoName}</span><button onClick={resetMetronome}><RotateCcw size={14} /> Reset</button></div>
          {countInInfo ? (
            <div className="sequence-now-playing count-in-banner">
              <Clock3 size={13} />
              <span><strong>Count-in</strong> · bar {countInInfo.bar} of {countInInfo.total}</span>
            </div>
          ) : activeSequence && (
            <div className="sequence-now-playing">
              <ListMusic size={13} />
              <span><strong>{activeSequence.name}</strong> · step {Math.min(activeSequenceStep + 1, activeSequence.steps.length)}/{activeSequence.steps.length}</span>
              <button type="button" onClick={clearSequence} aria-label="Stop using this sequence"><X size={12} /></button>
            </div>
          )}
          <div className="tempo-readout"><button onClick={() => setBpmLive(Math.max(35, bpm - 1))} disabled={!!activeSequence} aria-label="Tempo down 1 BPM"><Minus size={21} /></button><div><strong>{displayBpm}</strong><span>BPM</span></div><button onClick={() => setBpmLive(Math.min(260, bpm + 1))} disabled={!!activeSequence} aria-label="Tempo up 1 BPM"><Plus size={21} /></button></div>
          <input className="tempo-slider" type="range" min="35" max="260" value={bpm} onChange={(event) => setBpmLive(Number(event.target.value))} aria-label="Tempo" disabled={!!activeSequence} />
          <div className="beat-lights" role="group" aria-label={`Beat ${currentBeat + 1} of ${displayBeatsPerBar}. Tap a beat to accent or silence it.`}>
            {Array.from({ length: displayBeatsPerBar }, (_, index) => {
              const mark: BeatMark = displayAccentPattern[index] ?? "normal";
              return (
                <button
                  type="button"
                  key={index}
                  className={[playing && currentBeat === index ? "is-active" : "", mark === "accent" ? "is-accent" : "", mark === "silent" ? "is-silent" : ""].filter(Boolean).join(" ")}
                  onClick={() => toggleAccentMark(index)}
                  disabled={!!activeSequence}
                  aria-label={`Beat ${index + 1}: ${mark}. Tap to change.`}
                >
                  <span>{index + 1}</span>
                </button>
              );
            })}
          </div>
          <p className="accent-hint">{activeSequence ? "Each step in the sequence keeps its own preset's accents." : "Tap a beat to cycle normal → accent → silent. Silent beats stay quiet but still keep the dot moving."}</p>
          <div className="pulse-primary-actions"><button className={`tap-button ${playing ? "is-assessing" : ""}`} onClick={handleTap}>{playing ? `Tap with pulse · ${rhythmTapCount}/16` : "Tap tempo"}</button><button className={`play-pulse ${playing ? "is-playing" : ""}`} onClick={togglePlaying}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}{playing ? "Pause" : "Start"}</button></div>
          {rhythmFeedback && <p className="rhythm-feedback"><Activity size={13} /> {rhythmFeedback}</p>}
        </section>

        <aside className="pulse-controls">
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}>
            <div className="control-head"><span><Activity size={15} /> Meter</span><small>{beatsPerBar}/{meterDenominator}</small></div>
            <div className="choice-row meter-choices">{METER_CHOICES.map((count) => <button key={count} className={beatsPerBar === count && polyrhythm === "off" ? "is-active" : ""} onClick={() => { setPolyrhythm("off"); changeBeatsPerBar(count); }} disabled={!!activeSequence}>{count}<small>/{COMPOUND_METERS.has(count) ? "8" : "4"}</small></button>)}</div>
          </article>
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}>
            <div className="control-head"><span><Zap size={15} /> Subdivision</span><small>{subdivision === 1 ? "Quarter" : subdivision === 2 ? "Eighth" : subdivision === 3 ? "Triplet" : subdivision === 4 ? "Sixteenth" : "Quintuplet"}</small></div>
            <div className="choice-row subdivision-choices">{[{v:1,l:"♩"},{v:2,l:"♫"},{v:3,l:"♩³"},{v:4,l:"♬"},{v:5,l:"♩⁵"}].map((item) => <button key={item.v} className={subdivision === item.v ? "is-active" : ""} onClick={() => setSubdivision(item.v)} disabled={!!activeSequence}>{item.l}</button>)}</div>
            {subdivision === 2 && (
              <div className="swing-row">
                <span>Swing</span>
                <input type="range" min="50" max="75" step="1" value={Math.round(swingRatio * 100)} onChange={(event) => setSwingRatio(Number(event.target.value) / 100)} aria-label="Swing ratio" disabled={!!activeSequence} />
                <small>{swingRatio === 0.5 ? "Straight" : `${Math.round(swingRatio * 100)}:${100 - Math.round(swingRatio * 100)}`}</small>
              </div>
            )}
          </article>
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}><div className="control-head"><span><Volume2 size={15} /> Click voice</span><small>Built-in synth</small></div><div className="choice-row voice-choices">{([{ id: "pure", label: "Pure" }, { id: "wood", label: "Wood" }, { id: "beep", label: "Beep" }, { id: "clave", label: "Clave" }] as { id: ClickVoice; label: string }[]).map((voice) => <button key={voice.id} className={clickVoice === voice.id ? "is-active" : ""} onClick={() => setClickVoice(voice.id)} disabled={!!activeSequence}>{voice.label}</button>)}</div></article>
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}><div className="control-head"><span><Clock3 size={15} /> Count-in</span><small>{countInBars ? `${countInBars} ${countInBars === 1 ? "bar" : "bars"}` : "Off"}</small></div><div className="choice-row"><button className={countInBars === 0 ? "is-active" : ""} onClick={() => setCountInBars(0)} disabled={!!activeSequence}>Off</button>{[1, 2, 4].map((count) => <button key={count} className={countInBars === count ? "is-active" : ""} onClick={() => setCountInBars(count)} disabled={!!activeSequence}>{count}</button>)}</div></article>
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}><div className="control-head"><span><Zap size={15} /> Silent-bar drill</span><small>{muteEveryBars ? `Every ${muteEveryBars} bars` : "Off"}</small></div><div className="choice-row"><button className={muteEveryBars === 0 ? "is-active" : ""} onClick={() => setMuteEveryBars(0)} disabled={!!activeSequence}>Off</button>{[2, 4, 8].map((count) => <button key={count} className={muteEveryBars === count ? "is-active" : ""} onClick={() => setMuteEveryBars(count)} disabled={!!activeSequence}>{count}</button>)}</div></article>
          <article className={`control-card ${activeSequence ? "is-locked" : ""}`}>
            <div className="control-head"><span><Activity size={15} /> Polyrhythm</span><small>{polyrhythm === "off" ? "Off" : polyrhythm}</small></div>
            <div className="choice-row">{(["off", "3:2", "4:3"] as const).map((choice) => <button key={choice} className={polyrhythm === choice ? "is-active" : ""} onClick={() => choosePolyrhythm(choice)} disabled={!!activeSequence}>{choice === "off" ? "Off" : choice}</button>)}</div>
            {polyrhythm !== "off" && <p className="control-hint">A second click voice divides each bar into {polyrhythm === "3:2" ? "2" : "3"} even parts against the {polyrhythm === "3:2" ? "3" : "4"}-beat pulse. Meter is locked to {polyrhythm === "3:2" ? "3/4" : "4/4"} while this is on.</p>}
          </article>
          <article className={`control-card ramp-control ${activeSequence ? "is-locked" : ""}`}>
            <div className="control-head"><span><TrendingUp size={15} /> Tempo ramp</span><button type="button" role="switch" aria-checked={rampEnabled} className={`toggle ${rampEnabled ? "is-on" : ""}`} onClick={() => setRampEnabled((value) => !value)} aria-label="Tempo ramp" disabled={!!activeSequence}><i /></button></div>
            {rampEnabled ? (
              <>
                <div className="ramp-fields">
                  <label>From<input type="number" inputMode="numeric" min={35} max={260} value={bpm} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setBpm(Math.min(260, Math.max(35, next))); }} aria-label="Ramp start tempo" disabled={!!activeSequence} /></label>
                  <ArrowRight size={14} />
                  <label>To<input type="number" inputMode="numeric" min={35} max={260} value={rampToBpm} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setRampToBpm(Math.min(260, Math.max(35, next))); }} aria-label="Ramp end tempo" disabled={!!activeSequence} /></label>
                </div>
                <div className="choice-row ramp-bars-choices">{[2, 4, 8, 16].map((count) => <button key={count} className={rampBars === count ? "is-active" : ""} onClick={() => setRampBars(count)} disabled={!!activeSequence}>{count}<small>bars</small></button>)}</div>
                <p className="control-hint">Steps to a new tempo once per bar over {rampBars} bars after any count-in -- the same stepwise ramp TE&rsquo;s click track uses, not a smooth sweep. Holds at {rampToBpm} BPM once it gets there. Presets can save this ramp with them.</p>
              </>
            ) : (
              <p className="control-hint">Off. Turn on to work an accelerando or ritardando into the click, one tempo step per bar.</p>
            )}
          </article>
          <article className="control-card haptic-control"><div><span><BellRing size={15} /> Feel the beat</span><p>A tactile pulse keeps your eyes on the music.</p></div><button type="button" role="switch" aria-checked={haptics} className={`toggle ${haptics ? "is-on" : ""}`} onClick={() => setHaptics((value) => !value)} aria-label="Feel the beat"><i /></button></article>
        </aside>
      </div>

      <section className="metronome-presets" aria-labelledby="metronome-presets-title">
        <div><span className="card-kicker"><Save size={14} /> Presets</span><h2 id="metronome-presets-title">Save the feel you’re working on.</h2><p>Count-ins, silent bars, tempo ramps and per-beat accents all stay with each preset on this device.</p></div>
        <div className="preset-list">{presets.map((preset) => (
          <span key={preset.id} className="preset-chip-wrap">
            <button className="preset-chip" onClick={() => applyPreset(preset)}><strong>{preset.name}</strong><small>{preset.bpm} BPM · {preset.beatsPerBar}/4{preset.muteEveryBars ? " · silent bar" : ""}{preset.rampToBpm ? ` · ramp to ${preset.rampToBpm}` : ""}</small></button>
            {!DEFAULT_METRONOME_PRESETS.some((defaultPreset) => defaultPreset.id === preset.id) && (
              <button type="button" className="chip-delete" aria-label={`Delete preset ${preset.name}`} onClick={() => deletePreset(preset.id)}><X size={12} /></button>
            )}
          </span>
        ))}</div>
        <form className="preset-save" onSubmit={(event) => { event.preventDefault(); savePreset(); }}><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name this preset" maxLength={36} aria-label="Preset name" /><button type="submit" disabled={!presetName.trim()}><Plus size={14} /> Save</button></form>
      </section>

      <section className="metronome-sequences" aria-labelledby="metronome-sequences-title">
        <div className="sequence-head"><span className="card-kicker"><ListMusic size={14} /> Sequences</span><h2 id="metronome-sequences-title">Chain presets into a routine.</h2><p>Bocal steps to the next preset at the bar boundary, still on the audio clock -- no stutter between steps. Pick one below, then press Start.</p></div>

        {sequences.length > 0 && (
          <div className="sequence-list">{sequences.map((sequence) => (
            <span key={sequence.id} className="sequence-chip-wrap">
              <button className={`sequence-chip ${activeSequence?.id === sequence.id ? "is-active" : ""}`} onClick={() => playSequence(sequence)}><strong>{sequence.name}</strong><small>{sequence.steps.length} {sequence.steps.length === 1 ? "step" : "steps"}{sequence.loop ? " · loops" : ""}</small></button>
              <button type="button" className="chip-delete" aria-label={`Delete sequence ${sequence.name}`} onClick={() => deleteSequence(sequence.id)}><X size={12} /></button>
            </span>
          ))}</div>
        )}

        <div className="sequence-builder">
          <div className="sequence-builder-row">
            <select value={draftPresetId} onChange={(event) => setDraftPresetId(event.target.value)} aria-label="Preset for the next step">{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
            <div className="choice-row sequence-bars-choices">{[1, 2, 4, 8].map((count) => <button key={count} className={draftBars === count ? "is-active" : ""} onClick={() => setDraftBars(count)}>{count}<small>{count === 1 ? "bar" : "bars"}</small></button>)}</div>
            <button type="button" className="sequence-add" onClick={addSequenceStep}><Plus size={14} /> Add step</button>
          </div>
          {sequenceDraft.length > 0 && (
            <ol className="sequence-steps">
              {sequenceDraft.map((step, index) => (
                <li key={`${step.presetId}-${index}`}>
                  <span>{index + 1}. {presetsById.get(step.presetId)?.name ?? "Unknown preset"} · {step.bars} {step.bars === 1 ? "bar" : "bars"}</span>
                  <button type="button" aria-label={`Remove step ${index + 1}`} onClick={() => removeSequenceStep(index)}><Minus size={12} /></button>
                </li>
              ))}
            </ol>
          )}
          <div className="sequence-builder-footer">
            <span className="sequence-loop"><button type="button" role="switch" aria-checked={draftLoop} className={`toggle ${draftLoop ? "is-on" : ""}`} onClick={() => setDraftLoop((value) => !value)} aria-label="Loop sequence"><i /></button><Repeat size={13} /> Loop</span>
            <form className="preset-save" onSubmit={(event) => { event.preventDefault(); saveSequence(); }}><input value={sequenceName} onChange={(event) => setSequenceName(event.target.value)} placeholder="Name this sequence" maxLength={36} aria-label="Sequence name" /><button type="submit" disabled={!sequenceName.trim() || sequenceDraft.length === 0}><Save size={14} /> Save</button></form>
          </div>
        </div>
      </section>

      <section className="drone-strip">
        <div><span className="drone-icon"><Headphones size={18} /></span><div><strong>Harmony drone</strong><small>Hear the tonal center beneath the click, tuned to your calibration.</small></div></div>
        <div className="drone-controls">
          <select value={dronePc} onChange={(event) => setDronePc(Number(event.target.value))} aria-label="Drone pitch class">{Array.from({ length: 12 }, (_, pc) => <option value={pc} key={pc}>{noteName(pc, "western")}</option>)}</select>
          <select value={droneOctave} onChange={(event) => setDroneOctave(Number(event.target.value))} aria-label="Drone octave">{DRONE_OCTAVES.map((octave) => <option value={octave} key={octave}>Octave {octave}</option>)}</select>
          <span className="drone-hz">{droneHz.toFixed(1)} Hz</span>
          <button className={droneOn ? "is-on" : ""} onClick={() => setDroneOn((value) => !value)}>{droneOn ? <Pause size={15} /> : <Volume2 size={15} />}{droneOn ? "Stop drone" : "Play drone"}</button>
        </div>
      </section>
    </div>
  );
}
