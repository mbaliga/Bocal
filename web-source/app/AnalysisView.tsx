"use client";

import {
  Activity,
  AudioLines,
  BarChart3,
  Download,
  FileAudio,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  Radio,
  Square,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel, frequencyFromMidi, type NotationSystem } from "./notation";
import { advanceHarmonicSmoothing, decimateLinear, findHarmonicPeaks, isModulating, type HarmonicSmoothEntry } from "./harmonics";
import { detectPitchYin } from "./pitch-engine";
import { TranscribePanel } from "./TranscribePanel";
import { TakePitchTrace, forgetTakeAnalysis } from "./TakePitchTrace";
import { recordPracticeActivity } from "./practice-data";
import {
  deleteStoredTake,
  extensionForMime,
  listStoredTakes,
  MAX_TAKES,
  putStoredTake,
  renameStoredTake,
  saveOrShareFile,
  type StoredTake,
} from "./takes-store";
import {
  readingFor,
  REFERENCE_HZ_DEFAULT,
  REFERENCE_HZ_MAX,
  REFERENCE_HZ_MIN,
  TEMPERAMENT_PROFILES,
  type TemperamentId,
  type TuningOptions,
} from "./tuning";
import "./styles/analysis.css";

type AnalysisMode = "waveform" | "spectrum" | "harmonics";
type RecordingTake = { id: string; name: string; url: string; createdAt: string; seconds: number; mime: string; blob: Blob };

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

// The live tuner persists its calibration to localStorage (see page.tsx); the
// keys are duplicated here rather than imported because they live on a
// component this file must not touch. Reading them lets the harmonic view
// name partials against the same reference pitch and temperament the player
// already chose, instead of silently assuming A440 equal temperament.
const TUNING_KEYS = {
  referenceHz: "bocal-reference-hz",
  temperament: "bocal-temperament",
  keyPc: "bocal-temperament-key",
} as const;

function readTuningOptions(): TuningOptions {
  const fallback: TuningOptions = { referenceHz: REFERENCE_HZ_DEFAULT, temperament: "equal", keyPc: 0 };
  if (typeof window === "undefined") return fallback;
  try {
    const savedHz = Number(window.localStorage.getItem(TUNING_KEYS.referenceHz));
    const referenceHz =
      Number.isFinite(savedHz) && savedHz >= REFERENCE_HZ_MIN && savedHz <= REFERENCE_HZ_MAX ? savedHz : fallback.referenceHz;
    const savedTemperament = window.localStorage.getItem(TUNING_KEYS.temperament);
    const temperament: TemperamentId =
      savedTemperament && savedTemperament in TEMPERAMENT_PROFILES ? (savedTemperament as TemperamentId) : "equal";
    const savedKeyPc = Number(window.localStorage.getItem(TUNING_KEYS.keyPc));
    const keyPc = Number.isInteger(savedKeyPc) && savedKeyPc >= 0 && savedKeyPc < 12 ? savedKeyPc : 0;
    return { referenceHz, temperament, keyPc };
  } catch {
    return fallback;
  }
}

/** Frequency span the Spectrum bars cover, independent of fftSize -- keeps
 *  the visible range steady even though the harmonics view (below) needs a
 *  larger fftSize than Spectrum alone would. */
const SPECTRUM_MAX_HZ = 4000;

/** The first eight partials is where a fundamental's overtone series stops
 *  being individually useful to look at on an ordinary reed or air stream -- higher
 *  than that they crowd together and the meter would just be noise. */
const HARMONIC_COUNT = 8;
/** Live fundamental search range: below a bassoon's low B♭ (58 Hz) and above
 *  the top of the woodwind altissimo range this app tunes. */
const HARMONIC_MIN_HZ = 45;
const HARMONIC_MAX_HZ = 1500;
/** How long a dropped-out fundamental is still shown before the bars clear.
 *  Matches the order of magnitude of the live tuner's own hold time so a
 *  tongued articulation doesn't blank the view between notes. */
const HARMONIC_HOLD_MS = 400;

type HarmonicPartial = {
  n: number;
  hz: number;
  noteLabel: string;
  /** In dB, relative to the strongest partial (0 = strongest). Null when the
   *  partial's frequency would fall above the usable band. */
  levelDb: number | null;
  /** Cents from n * measured H1, the exact harmonic target. Null when out of
   *  range, and never populated for H1 itself (see harmonics.md finding 1):
   *  H1 is by definition the reference every other partial is measured
   *  against, so a "cents" number on it would only restate detector noise. */
  cents: number | null;
  inRange: boolean;
};

type HarmonicsState = {
  f0: number | null;
  partials: HarmonicPartial[];
  /** True when the fundamental moved detectably between the first and
   *  second half of the analysis window -- i.e. vibrato (or a slide), not
   *  partials genuinely drifting off their harmonic ratios. See
   *  isModulating in harmonics.ts. */
  modulating: boolean;
};

function harmonicNoteLabel(
  hz: number,
  instrument: InstrumentProfile,
  notation: NotationSystem,
  saTonic: number,
  tuningOptions: TuningOptions,
) {
  const reading = readingFor(hz, tuningOptions);
  return fullNoteLabel(reading.concertMidi + instrument.writtenOffset, notation, saTonic);
}

export function AnalysisView({
  instrument,
  notation,
  saTonic,
}: {
  instrument: InstrumentProfile;
  notation: NotationSystem;
  saTonic: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const takeUrlsRef = useRef<string[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const takeAudioRef = useRef<HTMLAudioElement>(null);
  const modeRef = useRef<AnalysisMode>("waveform");
  const lastMetricAtRef = useRef(0);
  const [mode, setMode] = useState<AnalysisMode>("waveform");
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [takes, setTakes] = useState<RecordingTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopTake, setLoopTake] = useState(false);
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState({ level: 0, peakHz: 0 });
  const [harmonics, setHarmonics] = useState<HarmonicsState>({ f0: null, partials: [], modulating: false });
  const [takesMessage, setTakesMessage] = useState("");

  // The harmonics view needs the current instrument/notation/tuning inside a
  // rAF loop that is only ever created once (see `draw` below), so the latest
  // values are mirrored into refs rather than added as effect dependencies.
  const instrumentRef = useRef(instrument);
  const notationRef = useRef(notation);
  const saTonicRef = useRef(saTonic);
  const tuningOptionsRef = useRef<TuningOptions | null>(null);
  if (tuningOptionsRef.current === null) tuningOptionsRef.current = readTuningOptions();
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { notationRef.current = notation; }, [notation]);
  useEffect(() => { saTonicRef.current = saTonic; }, [saTonic]);

  // EMA-smoothed {levelDb, cents} per partial, plus timing for the "still
  // holding the last note" grace period and the state-publish throttle.
  const harmonicsSmoothRef = useRef<HarmonicSmoothEntry[]>(new Array(HARMONIC_COUNT).fill(null));
  const harmonicsLastPitchAtRef = useRef(0);
  const harmonicsLastF0Ref = useRef<number | null>(null);
  const harmonicsModulatingRef = useRef(false);
  const harmonicsThrottleRef = useRef(0);
  // Reused across frames instead of allocated fresh each time -- see
  // engineering.md finding 2 and analysis.md's "13ms/frame" measurement.
  const decimatedBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const freqDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const draw = useCallback(function renderAnalysisFrame() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!canvas || !analyser || !audioContext) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0b0b0d";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "#24242a";
    context.lineWidth = 1;
    for (let line = 1; line < 5; line += 1) {
      const y = (height / 5) * line;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    let level = 0;
    let peakHz = 0;
    if (modeRef.current === "waveform") {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      context.beginPath();
      context.strokeStyle = "#08fed5";
      context.lineWidth = 2;
      let energy = 0;
      data.forEach((sample, index) => {
        energy += sample * sample;
        const x = (index / (data.length - 1)) * width;
        const y = height * 0.5 - sample * height * 0.38;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      level = Math.min(100, Math.round(Math.sqrt(energy / data.length) * 420));
    } else if (modeRef.current === "spectrum") {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      // The bin count scales with fftSize, so a fixed bin count would show a
      // narrower frequency range at a larger fftSize. Deriving it from the
      // actual bin width keeps the visible span (roughly up to SPECTRUM_MAX_HZ)
      // the same regardless of the analyser's resolution.
      const binHz = audioContext.sampleRate / analyser.fftSize;
      const displayedBins = Math.min(data.length, Math.max(1, Math.round(SPECTRUM_MAX_HZ / binHz)));
      const barWidth = width / displayedBins;
      // One gradient for the whole frame rather than one per bar -- the old
      // per-bar createLinearGradient allocated hundreds of gradient objects
      // every frame for no visible benefit (see engineering.md).
      const gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "#08fed5");
      gradient.addColorStop(1, "#8e7bff");
      context.fillStyle = gradient;
      // Rumble/DC guard: bins below 40 Hz are never a real spectral peak in
      // this app's use, just mic handling noise and the analyser's DC bin.
      // Without this the "strongest bin" readout below picks bin 0 and shows
      // "0 Hz" while five clean peaks sit on screen (analysis.md).
      const startBin = Math.max(1, Math.ceil(40 / binHz));
      let peakValue = 0;
      let peakIndex = startBin;
      for (let index = startBin; index < displayedBins; index += 1) {
        const value = data[index] / 255;
        if (data[index] > peakValue) { peakValue = data[index]; peakIndex = index; }
        const barHeight = value * height * 0.85;
        context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
      }
      level = Math.round((peakValue / 255) * 100);
      peakHz = peakValue > 0 ? Math.round((peakIndex * audioContext.sampleRate) / analyser.fftSize) : 0;

      // Note-labelled ticks along a log-frequency axis: a linear 0-4000 Hz
      // bar view crowds every woodwind fundamental into its left fifth, and
      // had no axis labels at all before this.
      context.strokeStyle = "#3a3a40";
      context.fillStyle = "#8a8a86";
      context.font = "9px var(--font-geist-mono, monospace)";
      context.textBaseline = "bottom";
      const minTickHz = 55;
      const logMin = Math.log2(minTickHz);
      const logMax = Math.log2(SPECTRUM_MAX_HZ);
      for (let midi = 24; midi <= 108; midi += 12) {
        const hz = frequencyFromMidi(midi);
        if (hz < minTickHz || hz > SPECTRUM_MAX_HZ) continue;
        const x = ((Math.log2(hz) - logMin) / (logMax - logMin)) * width;
        context.beginPath();
        context.moveTo(x, height);
        context.lineTo(x, height - 6);
        context.stroke();
        context.fillText(fullNoteLabel(midi, "western"), x + 2, height - 1);
      }
    } else {
      // Harmonics: the canvas keeps just the dark backdrop drawn above --
      // the bars themselves are plain HTML/CSS over the canvas (see the
      // .harmonics-overlay markup below) so each one can carry a harmonic
      // number, a note name, a dB readout and a cents readout as real text.
      if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) {
        timeDataRef.current = new Float32Array(analyser.fftSize);
      }
      const timeData = timeDataRef.current;
      analyser.getFloatTimeDomainData(timeData);
      let energy = 0;
      for (let index = 0; index < timeData.length; index += 1) energy += timeData[index] * timeData[index];
      level = Math.min(100, Math.round(Math.sqrt(energy / timeData.length) * 420));

      const nowMs = performance.now();
      const smoothArr = harmonicsSmoothRef.current;

      // YIN over the full 8192-sample window costs ~13ms on desktop and
      // would run every animation frame though only the 130ms-throttled
      // publish below ever surfaces it -- gate the expensive work to that
      // same cadence instead (analysis.md, engineering.md finding 2), and
      // decimate 2x first: the lowest target here (45 Hz) is nowhere near a
      // decimated Nyquist limit, so nothing but time is lost running YIN at
      // the full rate.
      if (nowMs - harmonicsThrottleRef.current > 130) {
        harmonicsThrottleRef.current = nowMs;
        const sampleRate = audioContext.sampleRate;
        const decimateFactor = 2;
        const decimated = decimateLinear(timeData, decimateFactor, decimatedBufferRef.current ?? undefined);
        decimatedBufferRef.current = decimated;
        const decimatedRate = sampleRate / decimateFactor;
        const pitch = detectPitchYin(decimated, decimatedRate, HARMONIC_MIN_HZ, HARMONIC_MAX_HZ);

        if (pitch) {
          harmonicsLastPitchAtRef.current = nowMs;
          if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
            freqDataRef.current = new Float32Array(analyser.frequencyBinCount);
          }
          const freqData = freqDataRef.current;
          analyser.getFloatFrequencyData(freqData);
          const binHz = sampleRate / analyser.fftSize;
          const nyquistLimit = (sampleRate / 2) * 0.9;

          // Reference every partial to the measured H1, not to YIN's f0: the
          // old code compared each FFT peak against n * yinF0, which mostly
          // measured disagreement between YIN's estimate and the FFT bin
          // rather than anything about the instrument (analysis.md finding 1).
          const h1 = findHarmonicPeaks(freqData, binHz, pitch.hz, 1, nyquistLimit)[0];
          const measuredF0 = h1?.measuredHz ?? pitch.hz;
          harmonicsLastF0Ref.current = measuredF0;

          // Vibrato detection: measure the fundamental in each half of the
          // same window independently. A steady tone gives near-identical
          // halves; ordinary vibrato does not. When it moved, the partials'
          // cents readings are showing pitch modulation, not partials
          // drifting off their harmonic ratios, so the UI suppresses the
          // in-tune/near/off colouring and says so instead.
          const half = decimated.length >> 1;
          const firstHalf = detectPitchYin(decimated.subarray(0, half), decimatedRate, HARMONIC_MIN_HZ, HARMONIC_MAX_HZ);
          const secondHalf = detectPitchYin(decimated.subarray(half), decimatedRate, HARMONIC_MIN_HZ, HARMONIC_MAX_HZ);
          harmonicsModulatingRef.current = !!(firstHalf && secondHalf && isModulating(firstHalf.hz, secondHalf.hz));

          const peaks = findHarmonicPeaks(freqData, binHz, measuredF0, HARMONIC_COUNT, nyquistLimit);
          harmonicsSmoothRef.current = advanceHarmonicSmoothing(smoothArr, peaks);
        } else if (nowMs - harmonicsLastPitchAtRef.current > HARMONIC_HOLD_MS) {
          harmonicsSmoothRef.current = new Array(HARMONIC_COUNT).fill(null);
          harmonicsLastF0Ref.current = null;
          harmonicsModulatingRef.current = false;
        }

        const f0 = harmonicsLastF0Ref.current;
        if (f0 === null) {
          setHarmonics((current) =>
            current.f0 === null && current.partials.length === 0 && !current.modulating
              ? current
              : { f0: null, partials: [], modulating: false });
        } else {
          const settled = harmonicsSmoothRef.current;
          const available = settled.filter((entry): entry is { levelDb: number; cents: number } => entry !== null);
          const maxLevel = available.length ? Math.max(...available.map((entry) => entry.levelDb)) : 0;
          const tuningOptions = tuningOptionsRef.current ?? readTuningOptions();
          const partials: HarmonicPartial[] = settled.map((entry, index) => {
            const n = index + 1;
            const hz = f0 * n;
            if (!entry) return { n, hz, noteLabel: "", levelDb: null, cents: null, inRange: false };
            return {
              n,
              hz,
              noteLabel: harmonicNoteLabel(hz, instrumentRef.current, notationRef.current, saTonicRef.current, tuningOptions),
              levelDb: entry.levelDb - maxLevel,
              // H1's own cents figure is meaningless by construction (it is
              // measured against itself) -- drop it from the display.
              cents: n === 1 ? null : entry.cents,
              inRange: true,
            };
          });
          setHarmonics({ f0, partials, modulating: harmonicsModulatingRef.current });
        }
      }
    }

    const now = performance.now();
    if (now - lastMetricAtRef.current > 180) {
      lastMetricAtRef.current = now;
      setMetrics({ level, peakHz });
    }
    frameRef.current = requestAnimationFrame(renderAnalysisFrame);
  }, []);

  const stopCapture = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setActive(false);
    setRecording(false);
    setMetrics({ level: 0, peakHz: 0 });
    harmonicsSmoothRef.current = new Array(HARMONIC_COUNT).fill(null);
    harmonicsLastF0Ref.current = null;
    harmonicsModulatingRef.current = false;
    setHarmonics({ f0: null, partials: [], modulating: false });
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
    takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Takes used to live only in memory: a reload, a backgrounded tab getting
  // discarded, or the Android WebView recreating itself after a renderer
  // crash lost every recording. Hydrate from IndexedDB on mount instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await listStoredTakes();
      if (cancelled || stored.length === 0) return;
      const hydrated: RecordingTake[] = stored.map((take: StoredTake) => {
        const url = URL.createObjectURL(take.blob);
        takeUrlsRef.current.push(url);
        return { id: take.id, name: take.name, url, createdAt: take.createdAt, seconds: take.seconds, mime: take.mime, blob: take.blob };
      });
      setTakes(hydrated);
      setSelectedTakeId(hydrated[0]?.id ?? null);
    })();
    return () => { cancelled = true; };
    // Runs once on mount only -- takes are otherwise managed entirely
    // through the handlers below, which keep IndexedDB and this component's
    // state in sync on every write.
  }, []);

  /** Adds a take to state and IndexedDB, evicting the oldest beyond
   *  MAX_TAKES rather than silently dropping it -- the eviction now revokes
   *  the dropped take's object URL, forgets its cached pitch analysis, and
   *  deletes it from storage, and the player is told it happened instead of
   *  a take just quietly vanishing (analysis.md). */
  const addTake = (take: RecordingTake) => {
    void putStoredTake({ id: take.id, name: take.name, createdAt: take.createdAt, seconds: take.seconds, mime: take.mime, blob: take.blob });
    setTakes((current) => {
      const next = [take, ...current];
      if (next.length > MAX_TAKES) {
        const evicted = next.slice(MAX_TAKES);
        for (const old of evicted) {
          URL.revokeObjectURL(old.url);
          forgetTakeAnalysis(old.id);
          void deleteStoredTake(old.id);
        }
        setTakesMessage(`${MAX_TAKES} takes kept — the oldest was removed to make room. Delete one yourself to keep more.`);
      }
      return next.slice(0, MAX_TAKES);
    });
    setSelectedTakeId(take.id);
  };

  const startCapture = async () => {
    if (active) {
      stopCapture();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Microphone capture is unavailable in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      });
      const audioContext = new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      // 8192 rather than the old 4096: a bassoon's low B♭ (58 Hz) needs a
      // narrow bin to separate its partials, which sit close together low in
      // the harmonic series. Spectrum's displayed range is derived from the
      // bin width above (see SPECTRUM_MAX_HZ) specifically so this doesn't
      // narrow what Spectrum shows.
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      tuningOptionsRef.current = readTuningOptions();
      setMessage("");
      setActive(true);
      draw();
    } catch {
      setMessage("Microphone permission is required for live analysis.");
    }
  };

  const toggleRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setMessage("Local recording is unavailable in this browser.");
      return;
    }
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const mime = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      takeUrlsRef.current.push(url);
      const duration = Math.max(1, Math.round((performance.now() - (recordingStartedAtRef.current ?? performance.now())) / 1000));
      const take: RecordingTake = {
        id: `take-${Date.now()}`,
        name: `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        url,
        createdAt: new Date().toISOString(),
        seconds: duration,
        mime,
        blob,
      };
      addTake(take);
      setRecordingSeconds(duration);
      recordPracticeActivity({ type: "analysis", seconds: duration, instrumentId: instrument.id, label: "Recorded analysis take" });
    };
    recorder.start(250);
    recorderRef.current = recorder;
    recordingStartedAtRef.current = performance.now();
    setRecordingSeconds(0);
    setRecording(true);
  };

  const selectedTake = takes.find((take) => take.id === selectedTakeId) ?? takes[0] ?? null;
  const importTake = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    takeUrlsRef.current.push(url);
    const take: RecordingTake = {
      id: `take-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Imported take",
      url,
      createdAt: new Date().toISOString(),
      seconds: 0,
      mime: file.type || "audio/mpeg",
      blob: file,
    };
    addTake(take);
    event.target.value = "";
  };
  const removeTake = (id: string) => {
    const take = takes.find((item) => item.id === id);
    if (take) URL.revokeObjectURL(take.url);
    forgetTakeAnalysis(id);
    void deleteStoredTake(id);
    setTakes((current) => current.filter((item) => item.id !== id));
    setSelectedTakeId((current) => current === id ? null : current);
  };
  const renameTake = (id: string, name: string) => {
    const trimmed = name.slice(0, 60);
    void renameStoredTake(id, trimmed);
    setTakes((current) => current.map((take) => take.id === id ? { ...take, name: trimmed } : take));
  };
  const downloadTake = (take: RecordingTake) => {
    void saveOrShareFile(new File([take.blob], `${take.name || "bocal-take"}.${extensionForMime(take.mime)}`, { type: take.mime }));
  };

  return (
    <div className="content-wrap analysis-layout">
      <section className="section-heading analysis-heading">
        <div><p className="eyebrow">Analyze · Live and local</p><h1>See your sound.</h1><p>Watch the waveform, spectrum or harmonics while you play, then record a take if you want to listen back.</p></div>
        <div className={`live-badge ${recording ? "is-recording" : ""}`}><span className={active ? "pulse-dot" : "quiet-dot"} /> {recording ? `Recording ${formatTime(recordingSeconds)}` : active ? "Live input" : "Ready"}</div>
      </section>

      <div className="analysis-grid">
        <section className="analysis-card">
          <header>
            <div className="analysis-tabs" aria-label="Analysis view">
              <button className={mode === "waveform" ? "is-active" : ""} onClick={() => setMode("waveform")}><Waves size={15} /> Waveform</button>
              <button className={mode === "spectrum" ? "is-active" : ""} onClick={() => setMode("spectrum")}><Activity size={15} /> Spectrum</button>
              <button className={mode === "harmonics" ? "is-active" : ""} onClick={() => setMode("harmonics")}><BarChart3 size={15} /> Harmonics</button>
            </div>
            <span><Radio size={14} /> {active ? `${metrics.level}% input` : "No input"}</span>
          </header>
          <div className="analysis-canvas-wrap">
            <canvas
              ref={canvasRef}
              aria-label={mode === "waveform" ? "Live audio waveform" : mode === "spectrum" ? "Live frequency spectrum" : "Harmonics backdrop"}
            />
            {!active && <div className="analysis-empty"><AudioLines size={28} /><strong>Start listening.</strong><span>The graph will move when the mic picks up your playing.</span></div>}
            {mode === "spectrum" && active && <span className="peak-readout">Strongest bin · {metrics.peakHz || "—"} Hz</span>}
            {mode === "harmonics" && active && (
              harmonics.f0 === null ? (
                <div className="analysis-empty harmonics-empty">
                  <BarChart3 size={26} />
                  <strong>Play a steady note.</strong>
                  <span>Hold one pitch and Bocal will map its first eight partials.</span>
                </div>
              ) : (
                <div className="harmonics-overlay" aria-live="polite">
                  <div className="harmonics-f0">
                    Fundamental · {Math.round(harmonics.f0)} Hz
                    {harmonics.modulating && <span className="harmonics-vibrato-tag">vibrato</span>}
                  </div>
                  <ol className="harmonics-bars">
                    {harmonics.partials.map((partial) => {
                      const centsClass =
                        !partial.inRange || partial.cents === null || harmonics.modulating
                          ? ""
                          : Math.abs(partial.cents) <= 5
                            ? "is-true"
                            : Math.abs(partial.cents) <= 15
                              ? "is-near"
                              : "is-off";
                      const meterPercent = partial.inRange && partial.levelDb !== null
                        ? Math.max(4, Math.min(100, ((partial.levelDb + 40) / 40) * 100))
                        : 0;
                      return (
                        <li key={partial.n} className={`${centsClass} ${partial.inRange ? "" : "is-out-of-range"}`}>
                          <span className="harmonic-index">H{partial.n}</span>
                          <span className="harmonic-note">{partial.inRange ? partial.noteLabel || "—" : "—"}</span>
                          <span className="harmonic-meter"><i style={{ width: `${meterPercent}%` }} /></span>
                          <span className="harmonic-db">{partial.inRange && partial.levelDb !== null ? `${Math.round(partial.levelDb)} dB` : "n/a"}</span>
                          <span className="harmonic-cents">
                            {!partial.inRange
                              ? "above range"
                              : partial.n === 1
                                ? "reference"
                                : harmonics.modulating
                                  ? "vibrato"
                                  : partial.cents !== null
                                    ? `${partial.cents > 0 ? "+" : ""}${Math.round(partial.cents)}¢`
                                    : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )
            )}
          </div>
          <div className="analysis-actions">
            <button className={active ? "secondary-analysis" : "primary-analysis"} onClick={() => void startCapture()}>{active ? <Pause size={17} /> : <Mic size={17} />}{active ? "Stop analysis" : "Start analysis"}</button>
            <button disabled={!active} className={recording ? "recording" : ""} onClick={toggleRecording}>{recording ? <Square size={15} fill="currentColor" /> : <span className="record-dot" />}{recording ? "Finish take" : "Record take"}</button>
          </div>
          {message && <p className="error-copy">{message}</p>}
          <p className="local-note"><LockKeyhole size={13} /> Live audio and recorded takes stay in this browser unless you download them.</p>
        </section>

        <aside className="analysis-side">
          <article>
            <span className="card-kicker"><Activity size={15} /> How to read it</span>
            <h2>{mode === "waveform" ? "Sound over time." : mode === "spectrum" ? "Energy by frequency." : "Where your overtones land."}</h2>
            <p>
              {mode === "waveform"
                ? "Look at the start and end of each note, changes in volume, and how steady the line stays. This view doesn’t grade your tone."
                : mode === "spectrum"
                  ? "The tallest bar shows where the most energy is right now. It is a quick visual cue, not a full analysis of pitch or tone quality."
                  : "Each bar is one of the first eight partials above your fundamental, numbered in order. The bar's length is that partial's level compared with the strongest one -- that's what this view actually shows: the relative balance of your overtones, not a tuning grade. The number on the right compares partials 2 and up against the fundamental you're holding; when the pitch itself is moving (vibrato, a slide) that number reads \"vibrato\" instead of a cents figure, because it would otherwise just be measuring the wobble rather than anything about the partials."}
            </p>
            {mode === "harmonics" && (
              <p className="harmonics-why">
                A quiet or missing bar just means little energy showed up at that partial -- it isn&rsquo;t a fault by
                itself. This view can&rsquo;t tell you whether your tone is good; it can only show you where the energy in
                it currently sits.
              </p>
            )}
            <div className="analysis-metrics">
              <span><small>Input level</small><strong>{active ? `${metrics.level}%` : "—"}</strong></span>
              <span>
                <small>{mode === "harmonics" ? "Fundamental" : "Peak bin"}</small>
                <strong>
                  {mode === "harmonics"
                    ? active && harmonics.f0 !== null ? `${Math.round(harmonics.f0)} Hz` : "—"
                    : active && mode === "spectrum" ? `${metrics.peakHz} Hz` : "—"}
                </strong>
              </span>
            </div>
          </article>
          <article className="take-card">
            <span className="card-kicker"><Radio size={15} /> Latest take</span>
            <input ref={importInputRef} className="visually-hidden" type="file" accept="audio/*" onChange={importTake} />
            {selectedTake ? <>
              <input className="take-name-input" value={selectedTake.name} onChange={(event) => renameTake(selectedTake.id, event.target.value)} aria-label="Take name" />
              <TakePitchTrace
                key={selectedTake.id}
                takeId={selectedTake.id}
                audioUrl={selectedTake.url}
                instrument={instrument}
                notation={notation}
                saTonic={saTonic}
                audioRef={takeAudioRef}
                tuningOptions={tuningOptionsRef.current ?? undefined}
              />
              <audio ref={takeAudioRef} controls loop={loopTake} src={selectedTake.url} onLoadedMetadata={(event) => { event.currentTarget.playbackRate = playbackRate; }} onPlay={(event) => { event.currentTarget.playbackRate = playbackRate; }} />
              <div className="take-tools"><label><span>Tempo</span><input type="range" min="0.75" max="1.25" step="0.05" value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} /></label><label className="take-loop"><input type="checkbox" checked={loopTake} onChange={(event) => setLoopTake(event.target.checked)} /> Loop</label></div>
              <div className="take-actions"><button onClick={() => downloadTake(selectedTake)}><Download size={15} /> Download</button><button onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import</button><button onClick={() => removeTake(selectedTake.id)}><Trash2 size={15} /> Delete</button></div>
              <div className="take-list">{takes.map((take) => <button key={take.id} className={take.id === selectedTake.id ? "is-active" : ""} onClick={() => setSelectedTakeId(take.id)}><FileAudio size={13} /><span>{take.name}</span><small>{take.seconds ? formatTime(take.seconds) : "Imported"}</small></button>)}</div>
              {takes.length >= MAX_TAKES && <p className="take-cap-note">{MAX_TAKES} takes kept — delete one to record another.</p>}
            </> : <div className="no-take"><Play size={21} /><p>Your latest recording will appear here. Import a take or record one above.</p><button onClick={() => importInputRef.current?.click()}><Upload size={14} /> Import audio</button></div>}
            {takesMessage && <p className="take-cap-note" role="status">{takesMessage}</p>}
          </article>
        </aside>
      </div>

      {/* Transcription lives here rather than behind its own tab: Analyze is
          already the surface where audio goes in and information comes out,
          and the nav arc is built for five destinations. */}
      <TranscribePanel instrument={instrument} notation={notation} saTonic={saTonic} tuningOptions={tuningOptionsRef.current ?? undefined} />
    </div>
  );
}
