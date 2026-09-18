"use client";

import { Activity, AudioLines, BarChart3, Download, FileAudio, LockKeyhole, Mic, Pause, Play, Radio, Square, Trash2, Upload, Waves } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel, frequencyFromMidi, type NotationSystem } from "./notation";
import { advanceHarmonicSmoothing, decimateLinear, findHarmonicPeaks, isModulating, type HarmonicSmoothEntry } from "./harmonics";
import { detectPitchYin } from "./pitch-engine";
import { TranscribePanel } from "./TranscribePanel";
import { TakePitchTrace, forgetTakeAnalysis } from "./TakePitchTrace";
import { recordPracticeActivity } from "./practice-data";
import { deleteStoredTake, extensionForMime, listStoredTakes, MAX_TAKES, putStoredTake, renameStoredTake, saveOrShareFile, type StoredTake } from "./takes-store";
import { audioImportError, canCreateTake, CaptureRequestGate, KeyedTaskQueue, MAX_RECORDING_SECONDS, RECORDING_STOP_BYTES, takeId } from "./take-policy";
import { readingFor, REFERENCE_HZ_DEFAULT, REFERENCE_HZ_MAX, REFERENCE_HZ_MIN, TEMPERAMENT_PROFILES, type TemperamentId, type TuningOptions } from "./tuning";
// Read-only: this view mirrors the live tuner's calibration to score a take
// against the same reference pitch and temperament, but never writes these
// keys. storage-keys.ts (owned by the tuner package) is their single source
// of truth now instead of a private copy of the same three literals.
import { TUNING_KEYS } from "./storage-keys";
import "./styles/analysis.css";

type AnalysisMode = "waveform" | "spectrum" | "harmonics";
type RecordingTake = StoredTake & { url: string };
function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60).toString().padStart(2, "0")}:${(rounded % 60).toString().padStart(2, "0")}`;
}
function readTuningOptions(): TuningOptions {
  const fallback: TuningOptions = { referenceHz: REFERENCE_HZ_DEFAULT, temperament: "equal", keyPc: 0 };
  if (typeof window === "undefined") return fallback;
  try {
    const savedHz = Number(window.localStorage.getItem(TUNING_KEYS.referenceHz));
    const referenceHz = Number.isFinite(savedHz) && savedHz >= REFERENCE_HZ_MIN && savedHz <= REFERENCE_HZ_MAX ? savedHz : fallback.referenceHz;
    const savedTemperament = window.localStorage.getItem(TUNING_KEYS.temperament);
    // Object.hasOwn needs Chrome 93; the standalone bundle's floor is Chrome
    // 69 (see vite.preview.config.ts), so use the classic equivalent.
    const hasTemperament = savedTemperament ? Object.prototype.hasOwnProperty.call(TEMPERAMENT_PROFILES, savedTemperament) : false;
    const temperament: TemperamentId = savedTemperament && hasTemperament ? savedTemperament as TemperamentId : "equal";
    const savedKeyPc = Number(window.localStorage.getItem(TUNING_KEYS.keyPc));
    return { referenceHz, temperament, keyPc: Number.isInteger(savedKeyPc) && savedKeyPc >= 0 && savedKeyPc < 12 ? savedKeyPc : 0 };
  } catch { return fallback; }
}
const SPECTRUM_MAX_HZ = 4000;
const HARMONIC_COUNT = 8;
const HARMONIC_MIN_HZ = 45;
const HARMONIC_MAX_HZ = 1500;
const HARMONIC_HOLD_MS = 400;
type HarmonicPartial = { n: number; hz: number; noteLabel: string; levelDb: number | null; cents: number | null; inRange: boolean };
type HarmonicsState = { f0: number | null; partials: HarmonicPartial[]; modulating: boolean };
function harmonicNoteLabel(hz: number, instrument: InstrumentProfile, notation: NotationSystem, saTonic: number, tuningOptions: TuningOptions) {
  const reading = readingFor(hz, tuningOptions);
  return fullNoteLabel(reading.concertMidi + instrument.writtenOffset, notation, saTonic);
}

export function AnalysisView({ instrument, notation, saTonic }: { instrument: InstrumentProfile; notation: NotationSystem; saTonic: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const takeUrlsRef = useRef(new Set<string>());
  const importInputRef = useRef<HTMLInputElement>(null);
  const takeAudioRef = useRef<HTMLAudioElement>(null);
  const modeRef = useRef<AnalysisMode>("waveform");
  const lastMetricAtRef = useRef(0);
  const mountedRef = useRef(true);
  const captureGateRef = useRef(new CaptureRequestGate());
  const requestingRef = useRef(false);
  const libraryReadyRef = useRef(false);
  const takesRef = useRef<RecordingTake[]>([]);
  const persistedIdsRef = useRef(new Set<string>());
  const writesRef = useRef(new KeyedTaskQueue());
  const deletingRef = useRef(new Set<string>());
  const [mode, setMode] = useState<AnalysisMode>("waveform");
  const [active, setActive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [libraryReady, setLibraryReady] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [takes, setTakes] = useState<RecordingTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopTake, setLoopTake] = useState(false);
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState({ level: 0, peakHz: 0 });
  const [harmonics, setHarmonics] = useState<HarmonicsState>({ f0: null, partials: [], modulating: false });
  const [takesMessage, setTakesMessage] = useState("");
  const instrumentRef = useRef(instrument);
  const notationRef = useRef(notation);
  const saTonicRef = useRef(saTonic);
  const tuningOptionsRef = useRef<TuningOptions | null>(null);
  if (tuningOptionsRef.current === null) tuningOptionsRef.current = readTuningOptions();
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { notationRef.current = notation; }, [notation]);
  useEffect(() => { saTonicRef.current = saTonic; }, [saTonic]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { if (takeAudioRef.current) takeAudioRef.current.playbackRate = playbackRate; }, [playbackRate]);

  const harmonicsSmoothRef = useRef<HarmonicSmoothEntry[]>(new Array(HARMONIC_COUNT).fill(null));
  const harmonicsLastPitchAtRef = useRef(0);
  const harmonicsLastF0Ref = useRef<number | null>(null);
  const harmonicsModulatingRef = useRef(false);
  const harmonicsThrottleRef = useRef(0);
  const decimatedBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const freqDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const spectrumDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const draw = useCallback(function renderAnalysisFrame() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!canvas || !analyser || !audioContext || !mountedRef.current) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0b0b0d"; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#24242a"; context.lineWidth = 1;
    for (let line = 1; line < 5; line += 1) {
      const y = height / 5 * line;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    let level = 0;
    let peakHz = 0;
    if (modeRef.current === "waveform") {
      if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) timeDataRef.current = new Float32Array(analyser.fftSize);
      const data = timeDataRef.current;
      analyser.getFloatTimeDomainData(data);
      context.beginPath(); context.strokeStyle = "#08fed5"; context.lineWidth = 2;
      let energy = 0;
      data.forEach((sample, index) => {
        energy += sample * sample;
        const x = index / (data.length - 1) * width;
        const y = height * 0.5 - sample * height * 0.38;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      level = Math.min(100, Math.round(Math.sqrt(energy / data.length) * 420));
    } else if (modeRef.current === "spectrum") {
      if (!spectrumDataRef.current || spectrumDataRef.current.length !== analyser.frequencyBinCount) spectrumDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      const data = spectrumDataRef.current;
      analyser.getByteFrequencyData(data);
      const binHz = audioContext.sampleRate / analyser.fftSize;
      const displayedBins = Math.min(data.length, Math.max(1, Math.round(SPECTRUM_MAX_HZ / binHz)));
      const barWidth = width / displayedBins;
      const gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "#08fed5"); gradient.addColorStop(1, "#8e7bff"); context.fillStyle = gradient;
      const startBin = Math.max(1, Math.ceil(40 / binHz));
      let peakValue = 0;
      let peakIndex = startBin;
      for (let index = startBin; index < displayedBins; index += 1) {
        const value = data[index] / 255;
        if (data[index] > peakValue) { peakValue = data[index]; peakIndex = index; }
        const barHeight = value * height * 0.85;
        context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
      }
      level = Math.round(peakValue / 255 * 100);
      peakHz = peakValue > 0 ? Math.round(peakIndex * audioContext.sampleRate / analyser.fftSize) : 0;
      // Axis and bars must use the SAME mapping; the former logarithmic labels
      // were incorrectly painted under linearly spaced spectral bins.
      context.strokeStyle = "#3a3a40"; context.fillStyle = "#8a8a86";
      context.font = "11px monospace"; context.textBaseline = "bottom";
      let lastLabelX = -40;
      for (let midi = 24; midi <= 108; midi += 12) {
        const hz = frequencyFromMidi(midi);
        if (hz < 55 || hz > displayedBins * binHz) continue;
        const x = hz / binHz * barWidth;
        context.beginPath(); context.moveTo(x, height); context.lineTo(x, height - 6); context.stroke();
        if (x - lastLabelX >= 36) { context.fillText(fullNoteLabel(midi, "western"), x + 2, height - 1); lastLabelX = x; }
      }
    } else {
      if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) timeDataRef.current = new Float32Array(analyser.fftSize);
      const timeData = timeDataRef.current;
      analyser.getFloatTimeDomainData(timeData);
      let energy = 0;
      for (let index = 0; index < timeData.length; index += 1) energy += timeData[index] * timeData[index];
      level = Math.min(100, Math.round(Math.sqrt(energy / timeData.length) * 420));
      const nowMs = performance.now();
      const smoothArr = harmonicsSmoothRef.current;
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
          if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) freqDataRef.current = new Float32Array(analyser.frequencyBinCount);
          const freqData = freqDataRef.current;
          analyser.getFloatFrequencyData(freqData);
          const binHz = sampleRate / analyser.fftSize;
          const nyquistLimit = sampleRate / 2 * 0.9;
          const h1 = findHarmonicPeaks(freqData, binHz, pitch.hz, 1, nyquistLimit)[0];
          const measuredF0 = h1?.measuredHz ?? pitch.hz;
          harmonicsLastF0Ref.current = measuredF0;
          const half = decimated.length >> 1;
          const firstHalf = detectPitchYin(decimated.subarray(0, half), decimatedRate, HARMONIC_MIN_HZ, HARMONIC_MAX_HZ);
          const secondHalf = detectPitchYin(decimated.subarray(half), decimatedRate, HARMONIC_MIN_HZ, HARMONIC_MAX_HZ);
          harmonicsModulatingRef.current = !!(firstHalf && secondHalf && isModulating(firstHalf.hz, secondHalf.hz));
          harmonicsSmoothRef.current = advanceHarmonicSmoothing(smoothArr, findHarmonicPeaks(freqData, binHz, measuredF0, HARMONIC_COUNT, nyquistLimit));
        } else if (nowMs - harmonicsLastPitchAtRef.current > HARMONIC_HOLD_MS) {
          harmonicsSmoothRef.current = new Array(HARMONIC_COUNT).fill(null);
          harmonicsLastF0Ref.current = null; harmonicsModulatingRef.current = false;
        }
        const f0 = harmonicsLastF0Ref.current;
        if (f0 === null) {
          setHarmonics((current) => current.f0 === null && current.partials.length === 0 && !current.modulating ? current : { f0: null, partials: [], modulating: false });
        } else {
          const settled = harmonicsSmoothRef.current;
          const available = settled.filter((entry): entry is { levelDb: number; cents: number } => entry !== null);
          const maxLevel = available.length ? Math.max(...available.map((entry) => entry.levelDb)) : 0;
          const tuningOptions = tuningOptionsRef.current ?? readTuningOptions();
          const partials: HarmonicPartial[] = settled.map((entry, index) => {
            const n = index + 1;
            const hz = f0 * n;
            if (!entry) return { n, hz, noteLabel: "", levelDb: null, cents: null, inRange: false };
            return { n, hz, noteLabel: harmonicNoteLabel(hz, instrumentRef.current, notationRef.current, saTonicRef.current, tuningOptions), levelDb: entry.levelDb - maxLevel, cents: n === 1 ? null : entry.cents, inRange: true };
          });
          setHarmonics({ f0, partials, modulating: harmonicsModulatingRef.current });
        }
      }
    }
    const now = performance.now();
    if (now - lastMetricAtRef.current > 180) { lastMetricAtRef.current = now; setMetrics({ level, peakHz }); }
    frameRef.current = requestAnimationFrame(renderAnalysisFrame);
  }, []);

  const stopCapture = useCallback(() => {
    captureGateRef.current.cancel(); requestingRef.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (mountedRef.current) setFinishing(true);
      try { recorder.stop(); } catch { /* onstop/track shutdown will settle any final chunks. */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    analyserRef.current = null;
    const audioContext = audioContextRef.current; audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
    takeAudioRef.current?.pause();
    harmonicsSmoothRef.current = new Array(HARMONIC_COUNT).fill(null);
    harmonicsLastF0Ref.current = null; harmonicsModulatingRef.current = false;
    if (mountedRef.current) {
      setActive(false); setRequesting(false); setRecording(false);
      setMetrics({ level: 0, peakHz: 0 }); setHarmonics({ f0: null, partials: [], modulating: false });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const onHidden = () => { if (document.hidden) stopCapture(); };
    window.addEventListener("bocal:host-pause", stopCapture);
    window.addEventListener("pagehide", stopCapture);
    document.addEventListener("visibilitychange", onHidden);
    const urls = takeUrlsRef.current;
    return () => {
      mountedRef.current = false;
      window.removeEventListener("bocal:host-pause", stopCapture);
      window.removeEventListener("pagehide", stopCapture);
      document.removeEventListener("visibilitychange", onHidden);
      stopCapture();
      urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear();
    };
  }, [stopCapture]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await listStoredTakes();
      if (cancelled) return;
      const currentIds = new Set(takesRef.current.map((take) => take.id));
      const restored = stored.filter((take) => !currentIds.has(take.id)).map((take) => {
        const url = URL.createObjectURL(take.blob);
        takeUrlsRef.current.add(url); persistedIdsRef.current.add(take.id);
        return { ...take, url };
      });
      const combined = [...takesRef.current, ...restored].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      takesRef.current = combined; setTakes(combined);
      setSelectedTakeId((current) => current ?? combined[0]?.id ?? null);
      libraryReadyRef.current = true; setLibraryReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Never evict a user's recording. The capacity gate runs BEFORE import/capture;
  // an already-finishing take is preserved even if a concurrent action filled the library.
  const addTake = useCallback((stored: StoredTake) => {
    if (mountedRef.current) {
      const url = URL.createObjectURL(stored.blob);
      takeUrlsRef.current.add(url);
      const next = [{ ...stored, url }, ...takesRef.current];
      takesRef.current = next; setTakes(next); setSelectedTakeId(stored.id);
      setTakesMessage("Saving recording to this device...");
    }
    void writesRef.current.run(stored.id, async () => {
      const saved = await putStoredTake(stored);
      if (saved) persistedIdsRef.current.add(stored.id);
      if (mountedRef.current) setTakesMessage(saved ? "Recording saved to this device. Export important takes for a separate backup." : "Recording is session-only. Download it before leaving this screen.");
      return saved;
    });
  }, []);

  const startCapture = async () => {
    if (streamRef.current || requestingRef.current) { stopCapture(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("Microphone capture is unavailable in this browser."); return; }
    const ticket = captureGateRef.current.begin();
    requestingRef.current = true; setRequesting(true); setMessage("");
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    const stillCurrent = () => mountedRef.current && captureGateRef.current.accepts(ticket) && !document.hidden;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } });
      if (!stillCurrent()) { stream.getTracks().forEach((track) => track.stop()); return; }
      audioContext = new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      if (!stillCurrent()) { stream.getTracks().forEach((track) => track.stop()); await audioContext.close(); return; }
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream; audioContextRef.current = audioContext; analyserRef.current = analyser;
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => { if (captureGateRef.current.accepts(ticket)) { stopCapture(); if (mountedRef.current) setMessage("Microphone disconnected. Start analysis again when it is available."); } }, { once: true }));
      tuningOptionsRef.current = readTuningOptions();
      setActive(true); draw();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
      if (stillCurrent()) {
        const name = error instanceof DOMException ? error.name : "";
        setMessage(name === "NotAllowedError" ? "Microphone permission was denied. Allow access, then start analysis again." : name === "NotFoundError" ? "No microphone was found." : "The microphone could not start. Check whether another app is using it, then retry.");
      }
    } finally {
      if (captureGateRef.current.accepts(ticket)) { requestingRef.current = false; if (mountedRef.current) setRequesting(false); }
    }
  };

  const toggleRecording = () => {
    const current = recorderRef.current;
    if (current) {
      if (current.state === "recording") { setFinishing(true); current.stop(); setRecording(false); }
      return;
    }
    if (!canCreateTake(takesRef.current.length, libraryReadyRef.current, MAX_TAKES)) { setTakesMessage(libraryReadyRef.current ? "Your take library is full. Download and delete a take before recording another. Existing takes have not been removed." : "Restoring saved recordings. Try again once they have loaded."); return; }
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") { setMessage("Local recording is unavailable in this browser."); return; }
    try {
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(preferredType ? { mimeType: preferredType } : {}), audioBitsPerSecond: 128000 });
      const chunks: Blob[] = [];
      let bytes = 0;
      const startedAt = performance.now();
      const instrumentId = instrument.id;
      const finishAtLimit = () => {
        if (recorder.state !== "inactive") {
          if (mountedRef.current) { setFinishing(true); setRecording(false); setTakesMessage("Recording limit reached. Finishing this take without removing any earlier recordings."); }
          recorder.stop();
        }
      };
      const timer = window.setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAt) / 1000);
        if (mountedRef.current) setRecordingSeconds(seconds);
        if (seconds >= MAX_RECORDING_SECONDS) finishAtLimit();
      }, 250);
      recorder.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= RECORDING_STOP_BYTES) finishAtLimit(); } };
      recorder.onerror = () => { if (mountedRef.current) setMessage("Recording was interrupted. Any audio received so far will be kept as a take."); finishAtLimit(); };
      recorder.onstop = () => {
        window.clearInterval(timer);
        if (recorderRef.current === recorder) recorderRef.current = null;
        const duration = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size > 0) {
          addTake({ id: takeId(), name: `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, createdAt: new Date().toISOString(), seconds: duration, mime, blob });
          recordPracticeActivity({ type: "analysis", seconds: duration, instrumentId, label: "Recorded analysis take" });
        } else if (mountedRef.current) setTakesMessage("No audio was recorded. Nothing was added or removed.");
        if (mountedRef.current) { setRecordingSeconds(duration); setRecording(false); setFinishing(false); }
      };
      try { recorder.start(250); }
      catch (error) { window.clearInterval(timer); throw error; }
      recorderRef.current = recorder; setRecordingSeconds(0); setRecording(true); setMessage("");
    } catch { setMessage("Recording could not start on this device. Live analysis is still available."); }
  };

  const selectedTake = takes.find((take) => take.id === selectedTakeId) ?? takes[0] ?? null;
  const canAdd = libraryReady && takes.length < MAX_TAKES && !recording && !finishing;
  const importTake = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!canCreateTake(takesRef.current.length, libraryReadyRef.current, MAX_TAKES) || recorderRef.current) { setTakesMessage("Finish the current recording or delete a saved take before importing. Existing takes have not been removed."); return; }
    const error = audioImportError(file);
    if (error) { setTakesMessage(error); return; }
    addTake({ id: takeId(), name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Imported take", createdAt: new Date().toISOString(), seconds: 0, mime: file.type || "application/octet-stream", blob: file });
  };
  const removeTake = async (id: string) => {
    if (deletingRef.current.has(id)) return;
    const take = takesRef.current.find((item) => item.id === id);
    if (!take || !window.confirm(`Delete "${take.name}" from Bocal? Export a separate copy first if you need to keep it.`)) return;
    deletingRef.current.add(id); setDeletingIds([...deletingRef.current]);
    const removed = await writesRef.current.run(id, async () => !persistedIdsRef.current.has(id) || await deleteStoredTake(id));
    if (removed) {
      persistedIdsRef.current.delete(id); URL.revokeObjectURL(take.url); takeUrlsRef.current.delete(take.url); forgetTakeAnalysis(id);
      const next = takesRef.current.filter((item) => item.id !== id); takesRef.current = next;
      if (mountedRef.current) { setTakes(next); setSelectedTakeId((current) => current === id ? null : current); setTakesMessage("Recording deleted from Bocal."); }
    }
    deletingRef.current.delete(id);
    if (mountedRef.current) setDeletingIds([...deletingRef.current]);
  };
  const renameTake = (id: string, name: string) => {
    if (deletingRef.current.has(id)) return;
    const trimmed = name.slice(0, 60);
    const next = takesRef.current.map((take) => take.id === id ? { ...take, name: trimmed } : take); takesRef.current = next; setTakes(next);
    void writesRef.current.run(id, async () => { if (persistedIdsRef.current.has(id)) await renameStoredTake(id, trimmed); });
  };
  const downloadTake = (take: RecordingTake) => { void saveOrShareFile(new File([take.blob], `${take.name || "bocal-take"}.${extensionForMime(take.mime)}`, { type: take.mime })); };

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
            <canvas ref={canvasRef} aria-label={mode === "waveform" ? "Live audio waveform" : mode === "spectrum" ? "Live frequency spectrum" : "Harmonics backdrop"} />
            {!active && <div className="analysis-empty"><AudioLines size={28} /><strong>Start listening.</strong><span>The graph will move when the mic picks up your playing.</span></div>}
            {mode === "spectrum" && active && <span className="peak-readout">Strongest bin · {metrics.peakHz || "—"} Hz</span>}
            {mode === "harmonics" && active && (
              harmonics.f0 === null ? <div className="analysis-empty harmonics-empty"><BarChart3 size={26} /><strong>Play a steady note.</strong><span>Hold one pitch and Bocal will map its first eight partials.</span></div> : (
                <div className="harmonics-overlay" aria-live="polite">
                  <div className="harmonics-f0">Fundamental · {Math.round(harmonics.f0)} Hz{harmonics.modulating && <span className="harmonics-vibrato-tag">vibrato</span>}</div>
                  <ol className="harmonics-bars">
                    {harmonics.partials.map((partial) => {
                      const centsClass = !partial.inRange || partial.cents === null || harmonics.modulating ? "" : Math.abs(partial.cents) <= 5 ? "is-true" : Math.abs(partial.cents) <= 15 ? "is-near" : "is-off";
                      const meterPercent = partial.inRange && partial.levelDb !== null ? Math.max(4, Math.min(100, (partial.levelDb + 40) / 40 * 100)) : 0;
                      return <li key={partial.n} className={`${centsClass} ${partial.inRange ? "" : "is-out-of-range"}`}>
                        <span className="harmonic-index">H{partial.n}</span><span className="harmonic-note">{partial.inRange ? partial.noteLabel || "—" : "—"}</span>
                        <span className="harmonic-meter"><i style={{ width: `${meterPercent}%` }} /></span>
                        <span className="harmonic-db">{partial.inRange && partial.levelDb !== null ? `${Math.round(partial.levelDb)} dB` : "n/a"}</span>
                        <span className="harmonic-cents">{!partial.inRange ? "above range" : partial.n === 1 ? "reference" : harmonics.modulating ? "vibrato" : partial.cents !== null ? `${partial.cents > 0 ? "+" : ""}${Math.round(partial.cents)}¢` : "—"}</span>
                      </li>;
                    })}
                  </ol>
                </div>
              )
            )}
          </div>
          <div className="analysis-actions">
            <button className={active || requesting ? "secondary-analysis" : "primary-analysis"} onClick={() => void startCapture()}>{active || requesting ? <Pause size={17} /> : <Mic size={17} />}{requesting ? "Cancel microphone request" : active ? "Stop analysis" : "Start analysis"}</button>
            <button disabled={!active || finishing || (!recording && !canAdd)} className={recording ? "recording" : ""} onClick={toggleRecording}>{recording ? <Square size={15} fill="currentColor" /> : <span className="record-dot" />}{finishing ? "Finishing take..." : recording ? "Finish take" : "Record take"}</button>
          </div>
          {message && <p className="error-copy" role="status">{message}</p>}
          <p className="local-note"><LockKeyhole size={13} /> Live audio and recorded takes stay in this browser unless you download them.</p>
          <p className="local-note">Takes stop after 10 minutes or at the recording size limit. Existing recordings are never removed automatically.</p>
        </section>
        <aside className="analysis-side">
          <article>
            <span className="card-kicker"><Activity size={15} /> How to read it</span>
            <h2>{mode === "waveform" ? "Sound over time." : mode === "spectrum" ? "Energy by frequency." : "Where your overtones land."}</h2>
            <p>{mode === "waveform" ? "Look at the start and end of each note, changes in volume, and how steady the line stays. This view doesn’t grade your tone." : mode === "spectrum" ? "The tallest bar shows where the most energy is right now. It is a quick visual cue, not a full analysis of pitch or tone quality." : "Each bar is one of the first eight partials above your fundamental, numbered in order. The bar's length is that partial's level compared with the strongest one -- that's what this view actually shows: the relative balance of your overtones, not a tuning grade. The number on the right compares partials 2 and up against the fundamental you're holding; when the pitch itself is moving (vibrato, a slide) that number reads \"vibrato\" instead of a cents figure, because it would otherwise just be measuring the wobble rather than anything about the partials."}</p>
            {mode === "harmonics" && <p className="harmonics-why">A quiet or missing bar just means little energy showed up at that partial -- it isn&rsquo;t a fault by itself. This view can&rsquo;t tell you whether your tone is good; it can only show you where the energy in it currently sits.</p>}
            <div className="analysis-metrics">
              <span><small>Input level</small><strong>{active ? `${metrics.level}%` : "—"}</strong></span>
              <span><small>{mode === "harmonics" ? "Fundamental" : "Peak bin"}</small><strong>{mode === "harmonics" ? active && harmonics.f0 !== null ? `${Math.round(harmonics.f0)} Hz` : "—" : active && mode === "spectrum" ? `${metrics.peakHz} Hz` : "—"}</strong></span>
            </div>
          </article>
          <article className="take-card">
            <span className="card-kicker"><Radio size={15} /> Latest take</span>
            <input ref={importInputRef} className="visually-hidden" type="file" accept="audio/*" onChange={importTake} />
            {!libraryReady && <p role="status">Restoring saved recordings...</p>}
            {selectedTake ? <>
              <input className="take-name-input" value={selectedTake.name} disabled={deletingIds.includes(selectedTake.id)} onChange={(event) => renameTake(selectedTake.id, event.target.value)} aria-label="Take name" />
              <TakePitchTrace key={selectedTake.id} takeId={selectedTake.id} audioUrl={selectedTake.url} instrument={instrument} notation={notation} saTonic={saTonic} audioRef={takeAudioRef} tuningOptions={tuningOptionsRef.current ?? undefined} />
              <audio ref={takeAudioRef} controls loop={loopTake} src={selectedTake.url} onLoadedMetadata={(event) => { event.currentTarget.playbackRate = playbackRate; }} onPlay={(event) => { event.currentTarget.playbackRate = playbackRate; }} />
              <div className="take-tools"><label><span>Tempo</span><input type="range" min="0.75" max="1.25" step="0.05" value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} /></label><label className="take-loop"><input type="checkbox" checked={loopTake} onChange={(event) => setLoopTake(event.target.checked)} /> Loop</label></div>
              <div className="take-actions"><button onClick={() => downloadTake(selectedTake)}><Download size={15} /> Download</button><button disabled={!canAdd} onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import</button><button disabled={deletingIds.includes(selectedTake.id)} onClick={() => void removeTake(selectedTake.id)}><Trash2 size={15} /> {deletingIds.includes(selectedTake.id) ? "Deleting..." : "Delete"}</button></div>
              <div className="take-list">{takes.map((take) => <button key={take.id} className={take.id === selectedTake.id ? "is-active" : ""} onClick={() => setSelectedTakeId(take.id)}><FileAudio size={13} /><span>{take.name}</span><small>{take.seconds ? formatTime(take.seconds) : "Imported"}</small></button>)}</div>
              {takes.length >= MAX_TAKES && <p className="take-cap-note">Your library is full. Download and delete a take to make room; nothing is removed automatically.</p>}
            </> : <div className="no-take"><Play size={21} /><p>Your latest recording will appear here. Import a take or record one above.</p><button disabled={!canAdd} onClick={() => importInputRef.current?.click()}><Upload size={14} /> Import audio</button></div>}
            {takesMessage && <p className="take-cap-note" role="status">{takesMessage}</p>}
          </article>
        </aside>
      </div>
      <TranscribePanel instrument={instrument} notation={notation} saTonic={saTonic} tuningOptions={tuningOptionsRef.current ?? undefined} />
    </div>
  );
}
