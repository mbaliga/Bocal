"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptureRequestGate } from "./take-policy";
import { useForegroundPause } from "./use-foreground-pause";
import {
  DAMPING_PRESETS,
  SENSITIVITY_PRESETS,
  StablePitchTracker,
  type Damping,
  type PitchTrackerReading,
  type Sensitivity,
  type StablePitchTrackerOptions,
} from "./pitch-engine";
import { drawPitchHistory, readPitchHistoryTheme, type PitchHistoryMode } from "./pitch-history-canvas";
import { PitchHistoryBuffer } from "./pitch-history";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel } from "./notation";
import { readingFor, targetHzFor, type TuningOptions } from "./tuning";
import {
  parseSkillEvidence,
  SKILL_EVIDENCE_STORAGE_KEY,
  summarizeTunerSession,
  withTunerSession,
} from "./skill-rating";
import { recordPracticeActivity } from "./practice-data";

export type PitchReading = {
  hz: number;
  /** The note as the player reads it, already transposed for the instrument. */
  writtenMidi: number;
  /** What the note actually sounds as, for anyone tuning against a piano. */
  concertMidi: number;
  cents: number;
};

// The pitch-history graph shows the trailing HISTORY_WINDOW_MS of readings.
// The ring buffer's capacity is sized off the sampling loop's own ~30ms
// cadence (see the `now - lastAnalysisAt >= 30` throttle in startListening
// below) with headroom for a slightly bursty rAF, not a separate constant
// someone could drift out of sync with the loop.
export const HISTORY_WINDOW_MS = 10_000;
const HISTORY_CAPACITY = Math.ceil(HISTORY_WINDOW_MS / 30) + 30;

export const PRECISION_TOLERANCE: Record<"standard" | "fine" | "ultra", number> = {
  standard: 10,
  fine: 5,
  ultra: 2,
};

function pitchFromFrequency(hz: number, writtenOffset: number, tuning: TuningOptions): PitchReading {
  const { concertMidi, cents } = readingFor(hz, tuning);
  return {
    hz,
    writtenMidi: concertMidi + writtenOffset,
    concertMidi,
    cents,
  };
}

export type UseTunerOptions = {
  sensitivity: Sensitivity;
  damping: Damping;
  tuning: TuningOptions;
  historyMode: PitchHistoryMode;
  precision: "standard" | "fine" | "ultra";
  /** Which pitch space the pitch-history graph's staff mode plots. */
  displayMode: "written" | "concert";
};

/**
 * Everything the live tuner needs to run: the AudioContext/analyser pair, the
 * `StablePitchTracker` instance and its sampling loop, the pitch-history ring
 * buffer and its imperative canvas paint, mic request cancellation, and the
 * keep-awake/foreground-pause wiring. Extracted out of page.tsx (see
 * tuner.md's "page.tsx is a 1619-line god component") so the component tree
 * only has to hold UI state; every audio/tracker concern lives here, behind
 * one hook.
 */
export function useTuner(instrument: InstrumentProfile, options: UseTunerOptions) {
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [trackerReading, setTrackerReading] = useState<PitchTrackerReading>({
    state: "silence",
    hz: null,
    rawHz: null,
    confidence: 0,
    rms: 0,
    gate: 0.009,
    accepted: false,
  });
  const [pitchTrace, setPitchTrace] = useState<number[]>([]);
  const [acceptedFrames, setAcceptedFrames] = useState(0);
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  // Manual target-note lock (TonalEnergy "Target", Tunable's note lock):
  // mirrors StablePitchTracker's own target so the UI can show a lock badge
  // without reaching into the tracker instance directly. Concert MIDI, the
  // same pitch space the raw tracker and `reading.concertMidi` use --
  // written/concert is purely a display concern, handled where the note
  // name is rendered. React state (not a ref) since the badge needs to
  // re-render when it changes; `lockTarget` is the only writer.
  const [lockedTargetMidi, setLockedTargetMidi] = useState<number | null>(null);

  const tunerGateRef = useRef(new CaptureRequestGate());
  const tunerPendingRef = useRef(false);
  const tunerMountedRef = useRef(true);
  const referenceEpochRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  // The pitch pipe's currently-sounding oscillator/gain pair, if any --
  // shares audioContextRef with everything else here (no second
  // AudioContext), and is torn down by `stopPitchPipe` on pointer-up or by
  // `stopListening` when the tuner session itself stops.
  const pitchPipeRef = useRef<{ oscillator: OscillatorNode; gain: GainNode } | null>(null);

  // Sensitivity (acquireFrames/switchFrames/minimumConfidence), Damping
  // (holdMs/smoothing) and the instrument's frequency range are reapplied to
  // the running tracker via `configure()` rather than replacing the
  // instance, so switching any of them mid-session no longer drops an
  // active lock or restarts the 320ms room calibration (tuner.md finding
  // "Changing Sensitivity or Damping mid-session rebuilds the tracker").
  // `range` also fixes the tracker's biggest fidelity bug: it used to always
  // fall back to StablePitchTracker's own 120-1600 Hz defaults, so a
  // bassoon/bari/tenor low register read as silence and a flute A6-C7 read
  // an octave low (tuner.md finding 1).
  const trackerOptions = useMemo<StablePitchTrackerOptions>(() => {
    const sensitivityOptions = SENSITIVITY_PRESETS[options.sensitivity];
    const dampingOptions = DAMPING_PRESETS[options.damping];
    return { ...sensitivityOptions, ...dampingOptions, minHz: instrument.range.minHz, maxHz: instrument.range.maxHz };
  }, [options.sensitivity, options.damping, instrument.range.minHz, instrument.range.maxHz]);
  // Lazily constructed (rather than `useRef(new StablePitchTracker(...))`,
  // which builds and immediately discards an instance on every render --
  // ~33/s while listening, per tuner.md) and reconfigured in place below.
  const trackerRef = useRef<StablePitchTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new StablePitchTracker(trackerOptions);
  useEffect(() => {
    trackerRef.current?.configure(trackerOptions);
  }, [trackerOptions]);

  const tunerEvidenceRef = useRef<{ startedAt: number; cents: number[]; midiNotes: number[] } | null>(null);

  // Read from a ref inside the sampling loop below, rather than closing over
  // `options.tuning` at the moment the loop started, so changing the
  // reference pitch or temperament mid-session takes effect on the very next
  // frame instead of only on the next "Start live tuner" press.
  const tuningOptionsRef = useRef(options.tuning);
  useEffect(() => {
    tuningOptionsRef.current = options.tuning;
  }, [options.tuning]);

  // Same pattern as tuningOptionsRef -- read live in the sampling loop so
  // toggling Calibration > Readout mid-session changes which midi new
  // history samples plot without needing a fresh "Start live tuner" press.
  const displayModeRef = useRef(options.displayMode);
  useEffect(() => {
    displayModeRef.current = options.displayMode;
  }, [options.displayMode]);

  // The pitch-history ring buffer lives in a ref, not React state, so pushing
  // a new sample every ~30ms during a session never triggers a re-render --
  // only the imperative canvas draw below reads it. historyCanvasRef is the
  // canvas TunerView renders; paintHistory draws directly onto it from the
  // rAF sampling loop the tuner already runs (see startListening), never
  // from a timer of its own.
  const pitchHistoryRef = useRef(new PitchHistoryBuffer(HISTORY_CAPACITY));
  const historyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyResizeObserverRef = useRef<ResizeObserver | null>(null);
  const paintHistory = useCallback(
    (fallbackNowMs: number) => {
      const canvas = historyCanvasRef.current;
      if (!canvas) return;
      const samples = pitchHistoryRef.current.toArray();
      const anchorMs = samples.length ? samples[samples.length - 1].tMs : fallbackNowMs;
      drawPitchHistory(canvas, pitchHistoryRef.current, {
        mode: options.historyMode,
        clef: instrument.clef,
        toleranceCents: PRECISION_TOLERANCE[options.precision],
        windowMs: HISTORY_WINDOW_MS,
        nowMs: anchorMs,
        theme: readPitchHistoryTheme(),
      });
    },
    [options.historyMode, instrument.clef, options.precision],
  );
  const paintHistoryRef = useRef(paintHistory);
  const [historyRepaintTheme, setHistoryRepaintTheme] = useState(0);
  useEffect(() => {
    paintHistoryRef.current = paintHistory;
    // Repaint immediately on a mode/theme-relevant change even while not
    // listening, so toggling Line/Staff (or the app theme) on a frozen,
    // post-session graph updates it right away instead of waiting for the
    // next "Start live tuner" press.
    if (!listening) paintHistory(performance.now());
    // `historyRepaintTheme` isn't a paintHistory dependency itself (colours
    // are re-read from the DOM on every call), it's a bump callers use (via
    // `history.repaint()`) to trigger this one extra repaint when something
    // outside this hook's own deps changes the theme.
  }, [paintHistory, listening, historyRepaintTheme]);
  const clearHistory = useCallback(() => {
    pitchHistoryRef.current.clear();
    paintHistoryRef.current(performance.now());
  }, []);
  const repaintHistory = useCallback(() => setHistoryRepaintTheme((value) => value + 1), []);
  // Callback ref (rather than a plain `useRef` attached via the `ref` prop)
  // so a repaint fires the moment the canvas actually mounts, not only when
  // one of paintHistory's dependencies happens to change. The canvas used to
  // go blank switching from Pulse back to Tune -- its backing store reset to
  // the untouched [300,104] default and stayed that way, because nothing in
  // the mount path called paintHistory (tuner.md finding "The frozen
  // pitch-history graph disappears after leaving and returning to Tune").
  // A ResizeObserver on the same node covers the other half of that finding
  // (rotating the phone on a frozen graph left it stretched until some other
  // event triggered a paint).
  const setHistoryCanvas = useCallback((node: HTMLCanvasElement | null) => {
    historyCanvasRef.current = node;
    historyResizeObserverRef.current?.disconnect();
    historyResizeObserverRef.current = null;
    if (!node) return;
    paintHistoryRef.current(performance.now());
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => paintHistoryRef.current(performance.now()));
      observer.observe(node);
      historyResizeObserverRef.current = observer;
    }
  }, []);
  useEffect(() => () => historyResizeObserverRef.current?.disconnect(), []);

  useEffect(() => {
    tunerMountedRef.current = true;
    const tunerGate = tunerGateRef.current;
    return () => {
      tunerMountedRef.current = false;
      tunerGate.cancel();
      tunerPendingRef.current = false;
      referenceEpochRef.current += 1;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  const saveTunerEvidence = useCallback(() => {
    const capture = tunerEvidenceRef.current;
    tunerEvidenceRef.current = null;
    if (!capture) return;
    const summary = summarizeTunerSession(
      capture.cents,
      capture.midiNotes,
      performance.now() - capture.startedAt,
    );
    if (!summary) return;
    try {
      const current = parseSkillEvidence(localStorage.getItem(SKILL_EVIDENCE_STORAGE_KEY));
      localStorage.setItem(SKILL_EVIDENCE_STORAGE_KEY, JSON.stringify(withTunerSession(current, summary)));
      window.dispatchEvent(new Event("bocal-skill-evidence"));
      recordPracticeActivity({
        type: "tuning",
        seconds: summary.durationMs / 1000,
        instrumentId: instrument.id,
        notes: summary.midiNotes.map((midi) => fullNoteLabel(midi, "western")),
        label: `${instrument.shortName} tuner session`,
      });
    } catch {
      // The tuner remains fully functional when device storage is unavailable.
    }
  }, [instrument.id, instrument.shortName]);

  // Stops the pitch pipe's currently-sounding tone, if any -- a short
  // release ramp rather than an abrupt cut, then disconnects the nodes.
  // Declared ahead of stopListening/startListening so both can call it.
  const stopPitchPipe = useCallback(() => {
    const active = pitchPipeRef.current;
    pitchPipeRef.current = null;
    if (!active) return;
    const { oscillator, gain } = active;
    const audioContext = audioContextRef.current;
    if (audioContext) {
      const now = audioContext.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      oscillator.stop(now + 0.09);
    } else {
      oscillator.stop();
    }
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, []);

  const stopListening = useCallback(() => {
    stopPitchPipe();
    tunerGateRef.current.cancel();
    tunerPendingRef.current = false;
    referenceEpochRef.current += 1;
    setMicMessage("");
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    // Disconnect the source/analyser pair rather than leaving them attached
    // to the shared AudioContext -- previously every Start/Stop cycle left
    // the old nodes connected, so a long session accumulated one analyser
    // per press (tuner.md/engineering.md: "analyser/source nodes accumulate
    // on the reused tuner AudioContext").
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    saveTunerEvidence();
    trackerRef.current!.reset();
    setListening(false);
    setReading(null);
    setTrackerReading({ state: "silence", hz: null, rawHz: null, confidence: 0, rms: 0, gate: 0.009, accepted: false });
    window.bocalHost?.setKeepAwake?.(false);
    // Idle the AudioContext rather than leaving it running (and the device
    // awake) between tuner sessions; startListening resumes it on the next
    // "Start live tuner" press.
    if (audioContextRef.current?.state === "running") void audioContextRef.current.suspend().catch(() => undefined);
  }, [saveTunerEvidence, stopPitchPipe]);

  useForegroundPause(stopListening);

  const startListening = useCallback(async () => {
    if (listening || streamRef.current || tunerPendingRef.current) {
      stopListening();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicMessage("Microphone access is not available in this browser.");
      return;
    }
    const ticket = tunerGateRef.current.begin();
    tunerPendingRef.current = true;
    setMicMessage("Waiting for microphone permission. Tap the tuner button again to cancel.");
    const stillCurrent = () => tunerMountedRef.current && tunerGateRef.current.accepts(ticket) && !document.hidden;
    let acquiredStream: MediaStream | null = null;
    let acquiredContext: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      });
      acquiredStream = stream;
      if (!stillCurrent()) { stream.getTracks().forEach((track) => track.stop()); return; }
      const audioContext = !audioContextRef.current || audioContextRef.current.state === "closed"
        ? new AudioContext()
        : audioContextRef.current;
      acquiredContext = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      if (!stillCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        if (audioContext !== audioContextRef.current) void audioContext.close().catch(() => undefined);
        return;
      }
      const analyser = audioContext.createAnalyser();
      // A 58 Hz bassoon fundamental needs more than 3 periods of headroom
      // after YIN's maximumTau is subtracted from the window, which 4096
      // samples at 48kHz doesn't give it -- widen to 8192 for any instrument
      // whose range dips under 100 Hz (bassoon, baritone; tuner.md finding 1).
      analyser.fftSize = instrument.range.minHz < 100 ? 8192 : 4096;
      analyser.smoothingTimeConstant = 0;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      const data = new Float32Array(analyser.fftSize);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => {
        if (tunerGateRef.current.accepts(ticket)) {
          stopListening();
          setMicMessage("Microphone disconnected. Reconnect it and start tuning again.");
        }
      }, { once: true }));
      setMicMessage("");
      setListening(true);
      window.bocalHost?.setKeepAwake?.(true);
      setReading(null);
      setPitchTrace([]);
      setAcceptedFrames(0);
      trackerRef.current!.reset();
      pitchHistoryRef.current.clear();
      tunerEvidenceRef.current = { startedAt: performance.now(), cents: [], midiNotes: [] };
      let lastAnalysisAt = Number.NEGATIVE_INFINITY;
      // Every accepted 30ms sample tick used to call setTrackerReading with a
      // fresh object (so it never bails out of a re-render) and setReading,
      // re-rendering the whole page -- side rail, dock, TunerView's 33 props,
      // ToneGenerator's own dozen states -- roughly 33 times a second while
      // listening (tuner.md finding "Every 30 ms sample tick re-renders the
      // whole page"). Publishing to React state is throttled to ~15 Hz
      // (66ms) OR whenever a value the UI actually displays changes, whichever
      // comes first; the ring buffer push and canvas paint below stay on the
      // full 30ms cadence since neither goes through React state.
      let lastPublishAt = Number.NEGATIVE_INFINITY;
      let lastPublishedState = "";

      const sample = () => {
        const now = performance.now();
        if (now - lastAnalysisAt >= 30) {
          lastAnalysisAt = now;
          analyser.getFloatTimeDomainData(data);
          const nextTrackerReading = trackerRef.current!.process(data, audioContext.sampleRate, now);
          const nextReading = nextTrackerReading.hz !== null
            ? pitchFromFrequency(nextTrackerReading.hz, instrument.writtenOffset, tuningOptionsRef.current)
            : null;
          const displaySignature = `${nextTrackerReading.state}|${nextReading ? nextReading.writtenMidi : ""}|${nextReading ? Math.round(nextReading.cents) : ""}|${Math.round(nextTrackerReading.confidence * 100)}`;
          const shouldPublish = now - lastPublishAt >= 66 || displaySignature !== lastPublishedState;
          if (shouldPublish) {
            lastPublishAt = now;
            lastPublishedState = displaySignature;
            setTrackerReading(nextTrackerReading);
            setReading(nextReading);
          }
          if (nextTrackerReading.hz !== null && nextReading) {
            if (nextTrackerReading.accepted && tunerEvidenceRef.current) {
              tunerEvidenceRef.current.cents.push(nextReading.cents);
              tunerEvidenceRef.current.midiNotes.push(nextReading.concertMidi);
              setAcceptedFrames(tunerEvidenceRef.current.cents.length);
              setPitchTrace((current) => [...current, nextReading.cents].slice(-18));
            }
            // The history graph only plots accepted (locked) frames as real
            // points -- acquiring/holding/silent frames push a gap (null),
            // same convention the 18-bar trace above already uses via
            // `accepted`, so a dropout reads as a break in the line rather
            // than a value that never actually locked.
            pitchHistoryRef.current.push({
              tMs: now,
              cents: nextTrackerReading.accepted ? nextReading.cents : null,
              midi: nextTrackerReading.accepted
                ? (displayModeRef.current === "concert" ? nextReading.concertMidi : nextReading.writtenMidi)
                : null,
            });
          } else {
            pitchHistoryRef.current.push({ tMs: now, cents: null, midi: null });
          }
          paintHistoryRef.current(now);
        }
        frameRef.current = requestAnimationFrame(sample);
      };
      sample();
    } catch (error) {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (acquiredContext && acquiredContext !== audioContextRef.current) void acquiredContext.close().catch(() => undefined);
      if (!stillCurrent()) return;
      stopListening();
      // Every failure used to be reported as "permission is needed", which
      // is wrong for a missing device, a device already in use, or a
      // browser without any audio input at all (engineering.md: "Every
      // getUserMedia failure is reported as a permission problem").
      const name = error instanceof DOMException ? error.name : "";
      setMicMessage(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone permission is needed for live tuning."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone was found on this device."
            : name === "NotReadableError"
              ? "The microphone is in use by another app."
              : "Microphone access failed. Check your device's microphone and try again.",
      );
    } finally {
      if (tunerGateRef.current.accepts(ticket)) tunerPendingRef.current = false;
    }
  }, [instrument.range.minHz, instrument.writtenOffset, listening, stopListening]);

  const playReferenceTone = useCallback(async (midi: number = 69) => {
    const epoch = referenceEpochRef.current;
    try {
      const audioContext = !audioContextRef.current || audioContextRef.current.state === "closed" ? new AudioContext() : audioContextRef.current;
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      if (!tunerMountedRef.current || document.hidden || epoch !== referenceEpochRef.current) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = targetHzFor(midi, tuningOptionsRef.current);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.45);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1.5);
    } catch {
      if (tunerMountedRef.current) setMicMessage("Reference tone could not play. Check the audio output and try again.");
    }
  }, []);

  // Pitch pipe: tap-and-hold the readout to hear the target note through
  // this same calibrated reference-tone path (targetHzFor, the shared
  // AudioContext -- no second one), released on pointer up rather than a
  // fixed envelope. `startPitchPipe` is idempotent with an in-flight pipe
  // tone: it stops the previous one first, so a finger sliding between
  // notes on the target picker retriggers cleanly.
  const startPitchPipe = useCallback(async (midi: number) => {
    stopPitchPipe();
    try {
      const audioContext = !audioContextRef.current || audioContextRef.current.state === "closed" ? new AudioContext() : audioContextRef.current;
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      if (!tunerMountedRef.current || document.hidden) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = targetHzFor(midi, tuningOptionsRef.current);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.04);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      pitchPipeRef.current = { oscillator, gain };
    } catch {
      if (tunerMountedRef.current) setMicMessage("Pitch pipe could not play. Check the audio output and try again.");
    }
  }, [stopPitchPipe]);

  // Locks (or, with `null`, releases) the manual target note. Mirrors the
  // call into the tracker instance (so the sampling loop measures against
  // it starting on the very next frame) and into React state (so the
  // readout can show a lock badge). Safe to call whether or not the tuner
  // is currently listening -- the tracker itself accepts it either way, and
  // `reset()` (called on every Start) preserves a set target, per
  // pitch-engine.ts's own `setTarget`/`reset` contract.
  const lockTarget = useCallback((midi: number | null) => {
    trackerRef.current?.setTarget(midi);
    setLockedTargetMidi(midi);
  }, []);

  // Whether a session is running OR a mic permission request is still in
  // flight (`tunerPendingRef`, read live rather than mirrored into React
  // state so waiting for permission doesn't add another render source).
  // Callers use this to decide whether switching away from the tuner needs
  // to stop it first -- calling `stop()` when neither is true is harmless in
  // itself, but it also bumps `referenceEpochRef`, which would needlessly
  // cancel an in-flight "Hear reference A" tone that has nothing to do with
  // a listening session.
  const isBusy = useCallback(() => listening || tunerPendingRef.current, [listening]);

  return {
    reading,
    trackerReading,
    pitchTrace,
    acceptedFrames,
    listening,
    micMessage,
    isBusy,
    lockedTargetMidi,
    lockTarget,
    start: startListening,
    stop: stopListening,
    playReference: playReferenceTone,
    startPitchPipe,
    stopPitchPipe,
    history: {
      canvasRef: setHistoryCanvas,
      clear: clearHistory,
      repaint: repaintHistory,
    },
  };
}
