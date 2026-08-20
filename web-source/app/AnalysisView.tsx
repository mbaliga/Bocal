"use client";

import {
  Activity,
  AudioLines,
  Download,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  Radio,
  Square,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type AnalysisMode = "waveform" | "spectrum";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function AnalysisView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const takeUrlRef = useRef<string | null>(null);
  const modeRef = useRef<AnalysisMode>("waveform");
  const lastMetricAtRef = useRef(0);
  const [mode, setMode] = useState<AnalysisMode>("waveform");
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState({ level: 0, peakHz: 0 });

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
    } else {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const displayedBins = Math.min(data.length, 320);
      const barWidth = width / displayedBins;
      let peakValue = 0;
      let peakIndex = 0;
      for (let index = 0; index < displayedBins; index += 1) {
        const value = data[index] / 255;
        if (data[index] > peakValue) { peakValue = data[index]; peakIndex = index; }
        const barHeight = value * height * 0.85;
        const gradient = context.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, "#08fed5");
        gradient.addColorStop(1, "#8e7bff");
        context.fillStyle = gradient;
        context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
      }
      level = Math.round((peakValue / 255) * 100);
      peakHz = Math.round((peakIndex * audioContext.sampleRate) / analyser.fftSize);
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
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
  }, []);

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
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
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
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setTakeUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        const next = URL.createObjectURL(blob);
        takeUrlRef.current = next;
        return next;
      });
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecordingSeconds(0);
    setRecording(true);
  };

  return (
    <div className="content-wrap analysis-layout">
      <section className="section-heading analysis-heading">
        <div><p className="eyebrow">Analyze · Live and local</p><h1>See your sound.</h1><p>Watch the waveform or spectrum while you play, then record a take if you want to listen back.</p></div>
        <div className={`live-badge ${recording ? "is-recording" : ""}`}><span className={active ? "pulse-dot" : "quiet-dot"} /> {recording ? `Recording ${formatTime(recordingSeconds)}` : active ? "Live input" : "Ready"}</div>
      </section>

      <div className="analysis-grid">
        <section className="analysis-card">
          <header>
            <div className="analysis-tabs" aria-label="Analysis view">
              <button className={mode === "waveform" ? "is-active" : ""} onClick={() => setMode("waveform")}><Waves size={15} /> Waveform</button>
              <button className={mode === "spectrum" ? "is-active" : ""} onClick={() => setMode("spectrum")}><Activity size={15} /> Spectrum</button>
            </div>
            <span><Radio size={14} /> {active ? `${metrics.level}% input` : "No input"}</span>
          </header>
          <div className="analysis-canvas-wrap">
            <canvas ref={canvasRef} aria-label={mode === "waveform" ? "Live audio waveform" : "Live frequency spectrum"} />
            {!active && <div className="analysis-empty"><AudioLines size={28} /><strong>Start listening.</strong><span>The graph will move when the mic picks up your playing.</span></div>}
            {mode === "spectrum" && active && <span className="peak-readout">Strongest bin · {metrics.peakHz || "—"} Hz</span>}
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
            <h2>{mode === "waveform" ? "Sound over time." : "Energy by frequency."}</h2>
            <p>{mode === "waveform" ? "Look at the start and end of each note, changes in volume, and how steady the line stays. This view doesn’t grade your tone." : "The tallest bar shows where the most energy is right now. It is a quick visual cue, not a full analysis of pitch or tone quality."}</p>
            <div className="analysis-metrics"><span><small>Input level</small><strong>{active ? `${metrics.level}%` : "—"}</strong></span><span><small>Peak bin</small><strong>{active && mode === "spectrum" ? `${metrics.peakHz} Hz` : "—"}</strong></span></div>
          </article>
          <article className="take-card">
            <span className="card-kicker"><Radio size={15} /> Latest take</span>
            {takeUrl ? <><audio controls src={takeUrl} /><a href={takeUrl} download={`bocal-take-${new Date().toISOString().slice(0, 10)}.webm`}><Download size={15} /> Download take</a></> : <div className="no-take"><Play size={21} /><p>Your latest recording will appear here.</p></div>}
          </article>
        </aside>
      </div>
    </div>
  );
}
