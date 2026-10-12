"use client";

import { ChevronLeft, ChevronRight, Eraser, Mic, MicOff, Pause, Radio, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { fullNoteLabel, type NotationSystem } from "./notation";
import type { PitchHistorySample } from "./pitch-history";
import {
  DEFAULT_WINDOW_MS,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  WINDOW_PRESETS_MS,
  centsClass,
  clampEndMs,
  clampWindowMs,
  defaultPitchView,
  formatSignedCents,
  liveEndMs,
  panPitch,
  panTime,
  pinchAxis,
  pinchFactor,
  samplePitch,
  splitPitch,
  wheelZoomFactor,
  yToMidi,
  zoomPitch,
  zoomTime,
  type PitchView,
  type PlotBox,
  type TimeBounds,
  type TimeView,
  type VocalGraphSource,
} from "./vocal-graph";
import { drawVocalGraph, plotBoxFor, readVocalGraphTheme, type GraphOverlay, type VocalGraphTheme } from "./vocal-graph-canvas";
import { glideRunning } from "./vocal-warmups";
import type { VocalRange } from "./vocal-range";

type VocalPitchGraphProps = {
  source: VocalGraphSource;
  listening: boolean;
  onListen: () => void;
  micMessage: string;
  notation: NotationSystem;
  saTonic: number;
  /** Half-width, in cents, of the in-tune colour band. */
  toleranceCents: number;
  range: VocalRange | null;
  /** Mutable overlay the warm-ups and range finder fill in; read on every repaint, never state. */
  overlayRef: MutableRefObject<GraphOverlay>;
  /** Any string that changes whenever the overlay does, so the graph repaints once while no frames are arriving. */
  overlayKey: string;
  /** Runs for every tuner frame, before the graph paints it. */
  onFrame?: (sample: PitchHistorySample) => void;
  /** A tap on the note names down the left edge. */
  onPickNote?: (midi: number) => void;
  /** Extra stage content (status chips, capture progress) laid over the plot. */
  children?: ReactNode;
};

const PITCH_PAN_STEP = 0.1;

function windowLabel(ms: number) {
  return ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`;
}

/**
 * The Vocal stage's live singing pitch graph. Pitch runs up the page, time
 * runs left to right and scrolls. It is painted from the tuner's own rAF
 * loop (through `source.subscribe`), reading the long vocal buffer; no frame
 * of pitch data ever goes through React state. Hold freezes the picture so it
 * can be panned and zoomed with pointer events while the microphone keeps
 * listening; Live snaps back.
 */
export function VocalPitchGraph({
  source,
  listening,
  onListen,
  micMessage,
  notation,
  saTonic,
  toleranceCents,
  range,
  overlayRef,
  overlayKey,
  onFrame,
  onPickNote,
  children,
}: VocalPitchGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const [held, setHeld] = useState(false);
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);

  // Everything the painter needs lives in refs so a frame never waits on React.
  const heldRef = useRef(false);
  const windowRef = useRef(DEFAULT_WINDOW_MS);
  const heldViewRef = useRef<TimeView>({ endMs: 0, windowMs: DEFAULT_WINDOW_MS });
  const pitchOverrideRef = useRef<PitchView | null>(null);
  const boxRef = useRef<PlotBox>(plotBoxFor(320, 240));
  const themeRef = useRef<{ key: string; value: VocalGraphTheme } | null>(null);
  const reducedMotionRef = useRef(false);
  const lastPlotRef = useRef({ listening, notation, saTonic, toleranceCents, range });
  const onFrameRef = useRef(onFrame);
  const onPickNoteRef = useRef(onPickNote);
  const readoutStateRef = useRef({ text: "", cls: "", at: 0 });

  useEffect(() => {
    lastPlotRef.current = { listening, notation, saTonic, toleranceCents, range };
    onFrameRef.current = onFrame;
    onPickNoteRef.current = onPickNote;
  });

  const boundsFor = useCallback((): TimeBounds => {
    const now = performance.now();
    return { oldestMs: source.buffer.oldestMs === null ? now : source.buffer.oldestMs, latestMs: source.buffer.latestMs === null ? now : source.buffer.latestMs };
  }, [source]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const plot = lastPlotRef.current;
    const overlay = overlayRef.current;
    const nowMs = performance.now();
    const bounds = boundsFor();
    const anchorMs = plot.listening ? nowMs : bounds.latestMs;

    let time: TimeView;
    if (heldRef.current) {
      const view = heldViewRef.current;
      time = { windowMs: view.windowMs, endMs: clampEndMs(view.endMs, view.windowMs, bounds) };
      heldViewRef.current = time;
    } else if (glideRunning(overlay.glide, nowMs)) {
      time = overlay.glide.view;
    } else {
      time = { windowMs: windowRef.current, endMs: liveEndMs(anchorMs, windowRef.current) };
    }
    const pitch = pitchOverrideRef.current || defaultPitchView(plot.range);

    const samples = source.buffer.between(time.endMs - time.windowMs - 400, time.endMs + 400);
    let head: { pitch: number; tMs: number } | null = null;
    if (!heldRef.current && plot.listening && samples.length) {
      const newest = samples[samples.length - 1];
      const pitchValue = samplePitch(newest);
      if (pitchValue !== null && nowMs - newest.tMs < 250) head = { pitch: pitchValue, tMs: newest.tMs };
    }

    const themeKey = `${document.documentElement.getAttribute("data-theme") || "dark"}`;
    if (!themeRef.current || themeRef.current.key !== themeKey) {
      themeRef.current = { key: themeKey, value: readVocalGraphTheme(canvas) };
    }
    boxRef.current = drawVocalGraph(canvas, {
      samples,
      time,
      pitch,
      anchorMs,
      toleranceCents: plot.toleranceCents,
      notation: plot.notation,
      saTonic: plot.saTonic,
      theme: themeRef.current.value,
      range: plot.range,
      overlay,
      head,
      reducedMotion: reducedMotionRef.current,
      nowMs,
    });
  }, [boundsFor, overlayRef, source]);

  const updateReadout = useCallback((sample: PitchHistorySample | null) => {
    const element = readoutRef.current;
    if (!element) return;
    const plot = lastPlotRef.current;
    const now = performance.now();
    const state = readoutStateRef.current;
    if (now - state.at < 90) return;
    let text = "–";
    let cls = "idle";
    const pitchValue = sample ? samplePitch(sample) : null;
    if (sample && pitchValue !== null) {
      const { midi, cents } = splitPitch(pitchValue);
      text = `${fullNoteLabel(midi, plot.notation, plot.saTonic)} ${formatSignedCents(cents)}¢`;
      cls = centsClass(cents, plot.toleranceCents);
    }
    if (text === state.text && cls === state.cls) return;
    state.text = text;
    state.cls = cls;
    state.at = now;
    element.textContent = text;
    element.setAttribute("data-state", cls);
  }, []);

  // Frames from the tuner's rAF loop.
  useEffect(() => {
    return source.subscribe((sample) => {
      onFrameRef.current?.(sample);
      updateReadout(sample);
      if (!heldRef.current) paint();
    });
  }, [source, paint, updateReadout]);

  // Repaint once when anything the frames do not drive changes.
  useEffect(() => {
    if (!listening) updateReadout(null);
    paint();
  }, [paint, updateReadout, listening, held, windowMs, notation, saTonic, toleranceCents, range, overlayKey]);

  // A new stored range re-scales the pitch axis to it.
  useEffect(() => {
    pitchOverrideRef.current = null;
    paint();
  }, [range, paint]);

  // Resize and reduced-motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    let observer: ResizeObserver | null = null;
    if (canvas && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => paint());
      observer.observe(canvas);
    }
    let query: MediaQueryList | null = null;
    const syncMotion = () => { reducedMotionRef.current = Boolean(query && query.matches); };
    if (typeof window.matchMedia === "function") {
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
      syncMotion();
      if (query.addEventListener) query.addEventListener("change", syncMotion);
      else if (query.addListener) query.addListener(syncMotion);
    }
    return () => {
      if (observer) observer.disconnect();
      if (query) {
        if (query.removeEventListener) query.removeEventListener("change", syncMotion);
        else if (query.removeListener) query.removeListener(syncMotion);
      }
    };
  }, [paint]);

  const currentPitchView = () => pitchOverrideRef.current || defaultPitchView(lastPlotRef.current.range);

  const applyTime = useCallback((next: TimeView) => {
    heldViewRef.current = next;
    paint();
  }, [paint]);

  const hold = () => {
    const bounds = boundsFor();
    const now = performance.now();
    const anchor = lastPlotRef.current.listening ? now : bounds.latestMs;
    const overlay = overlayRef.current;
    heldViewRef.current = glideRunning(overlay.glide, now)
      ? overlay.glide.view
      : { windowMs: windowRef.current, endMs: liveEndMs(anchor, windowRef.current) };
    heldRef.current = true;
    setHeld(true);
  };

  const goLive = () => {
    heldRef.current = false;
    pitchOverrideRef.current = null;
    setHeld(false);
  };

  const choosePreset = (ms: number) => {
    const next = clampWindowMs(ms);
    windowRef.current = next;
    setWindowMs(next);
    if (heldRef.current) {
      const view = heldViewRef.current;
      heldViewRef.current = { windowMs: next, endMs: clampEndMs(view.endMs, next, boundsFor()) };
    }
    paint();
  };

  const zoomBy = (factor: number) => {
    if (!heldRef.current) return;
    const next = zoomTime(heldViewRef.current, factor, 1, boundsFor());
    windowRef.current = next.windowMs;
    setWindowMs(next.windowMs);
    applyTime(next);
  };

  const panBy = (fractionOfWindow: number) => {
    if (!heldRef.current) return;
    const box = boxRef.current;
    applyTime(panTime(heldViewRef.current, fractionOfWindow * box.width, box.width, boundsFor()));
  };

  // Pointer events: one finger or mouse drag pans time (and pitch, once
  // zoomed), two fingers pinch. All of it is ignored unless the graph is held.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const box = boxRef.current;
    if (x < box.left && onPickNoteRef.current && pointersRef.current.size === 0) {
      const midi = Math.round(yToMidi(y, currentPitchView(), box));
      onPickNoteRef.current(midi);
      return;
    }
    if (!heldRef.current) return;
    pointersRef.current.set(event.pointerId, { x, y });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* the drag still works without capture */ }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const pointers = pointersRef.current;
    const previous = pointers.get(event.pointerId);
    if (!canvas || !previous || !heldRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const next = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const box = boxRef.current;
    if (pointers.size === 1) {
      applyTime(panTime(heldViewRef.current, next.x - previous.x, box.width, boundsFor()));
      if (pitchOverrideRef.current) pitchOverrideRef.current = panPitch(pitchOverrideRef.current, next.y - previous.y, box.height);
      pointers.set(event.pointerId, next);
      paint();
      return;
    }
    if (pointers.size === 2) {
      const other = Array.from(pointers.entries()).filter(([id]) => id !== event.pointerId)[0][1];
      const beforeDx = Math.abs(previous.x - other.x);
      const beforeDy = Math.abs(previous.y - other.y);
      const afterDx = Math.abs(next.x - other.x);
      const afterDy = Math.abs(next.y - other.y);
      const axis = pinchAxis(afterDx, afterDy);
      if (axis === "pitch") {
        const factor = beforeDy > 12 ? pinchFactor(beforeDy, afterDy) : pinchFactor(Math.hypot(beforeDx, beforeDy), Math.hypot(afterDx, afterDy));
        const midY = (next.y + other.y) / 2;
        const anchor = 1 - (midY - box.top) / box.height;
        pitchOverrideRef.current = zoomPitch(currentPitchView(), factor, anchor);
      } else {
        const factor = beforeDx > 12 ? pinchFactor(beforeDx, afterDx) : pinchFactor(Math.hypot(beforeDx, beforeDy), Math.hypot(afterDx, afterDy));
        const midX = (next.x + other.x) / 2;
        const anchor = (midX - box.left) / box.width;
        const zoomed = zoomTime(heldViewRef.current, factor, anchor, boundsFor());
        windowRef.current = zoomed.windowMs;
        setWindowMs(zoomed.windowMs);
        heldViewRef.current = zoomed;
      }
      pointers.set(event.pointerId, next);
      paint();
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    try { canvasRef.current?.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  // The wheel needs a non-passive listener to stop the page scrolling while held.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!heldRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const box = boxRef.current;
      const factor = wheelZoomFactor(event.deltaY);
      if (event.shiftKey) {
        const anchor = 1 - (event.clientY - rect.top - box.top) / box.height;
        pitchOverrideRef.current = zoomPitch(pitchOverrideRef.current || defaultPitchView(lastPlotRef.current.range), factor, anchor);
      } else {
        const anchor = (event.clientX - rect.left - box.left) / box.width;
        const zoomed = zoomTime(heldViewRef.current, factor, anchor, boundsFor());
        windowRef.current = zoomed.windowMs;
        setWindowMs(zoomed.windowMs);
        heldViewRef.current = zoomed;
      }
      paint();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [boundsFor, paint]);

  const zoomPitchBy = (factor: number) => {
    if (!heldRef.current) return;
    pitchOverrideRef.current = zoomPitch(currentPitchView(), factor, 0.5);
    paint();
  };
  const shiftPitch = (direction: 1 | -1) => {
    if (!heldRef.current) return;
    const view = currentPitchView();
    const box = boxRef.current;
    pitchOverrideRef.current = panPitch(view, -direction * PITCH_PAN_STEP * box.height, box.height);
    paint();
  };

  const clearGraph = () => {
    source.clear();
    paint();
    updateReadout(null);
  };

  const windowIsPreset = WINDOW_PRESETS_MS.indexOf(windowMs) >= 0;

  return (
    <div className={`vocal-graph ${held ? "is-held" : ""}`}>
      <div className="vocal-graph-toolbar" role="toolbar" aria-label="Pitch graph controls">
        <div className="vocal-graph-group">
          <button type="button" className={`vocal-key ${listening ? "is-live" : "is-primary"}`} onClick={onListen} >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
            {listening ? "Stop microphone" : "Start microphone"}
          </button>
          <button type="button" className={`vocal-key ${held ? "is-on" : ""}`} aria-pressed={held} onClick={held ? goLive : hold}>
            <Pause size={15} /> Hold
          </button>
          <button type="button" className="vocal-key" onClick={goLive} disabled={!held} aria-label="Back to live graph">
            <Radio size={15} /> Live
          </button>
        </div>
        <div className="vocal-graph-group">
          <div className="vocal-crater" role="group" aria-label="Time shown">
            {WINDOW_PRESETS_MS.map((ms) => (
              <button type="button" key={ms} className={windowMs === ms ? "is-active" : ""} aria-pressed={windowMs === ms} onClick={() => choosePreset(ms)}>
                {windowLabel(ms)}
              </button>
            ))}
          </div>
          <button type="button" className="vocal-key is-icon" onClick={clearGraph} aria-label="Clear graph"><Eraser size={15} /></button>
        </div>
      </div>

      {held && (
        <div className="vocal-graph-toolbar vocal-graph-review" role="toolbar" aria-label="Review held graph">
          <div className="vocal-graph-group">
            <button type="button" className="vocal-key is-icon" onClick={() => panBy(0.25)} aria-label="Look earlier"><ChevronLeft size={16} /></button>
            <button type="button" className="vocal-key is-icon" onClick={() => panBy(-0.25)} aria-label="Look later"><ChevronRight size={16} /></button>
            <button type="button" className="vocal-key is-icon" onClick={() => zoomBy(1.5)} aria-label="Show less time" disabled={windowMs <= MIN_WINDOW_MS}><ZoomIn size={16} /></button>
            <button type="button" className="vocal-key is-icon" onClick={() => zoomBy(1 / 1.5)} aria-label="Show more time" disabled={windowMs >= MAX_WINDOW_MS}><ZoomOut size={16} /></button>
            <button type="button" className="vocal-key" onClick={() => zoomPitchBy(1.25)}>Pitch +</button>
            <button type="button" className="vocal-key" onClick={() => zoomPitchBy(0.8)}>Pitch &minus;</button>
            <button type="button" className="vocal-key is-icon" onClick={() => shiftPitch(1)} aria-label="Look at higher notes">&uarr;</button>
            <button type="button" className="vocal-key is-icon" onClick={() => shiftPitch(-1)} aria-label="Look at lower notes">&darr;</button>
          </div>
          <p className="vocal-graph-help">Held. Drag to move through time, scroll or pinch to zoom, pinch up and down for pitch. The microphone is still listening.</p>
        </div>
      )}

      <div className="vocal-graph-plot">
        <canvas
          ref={canvasRef}
          className="vocal-graph-canvas"
          role="img"
          aria-label={`Singing pitch graph, ${windowIsPreset ? windowLabel(windowMs) : `${Math.round(windowMs / 1000)} s`} of time${held ? ", held" : ""}. Note names run up the left edge.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
        <div className="vocal-readout" aria-hidden="true">
          <small>Now</small>
          <div ref={readoutRef} data-state="idle">{"–"}</div>
        </div>
        {!listening && (
          <p className="vocal-graph-empty" role="status">
            {micMessage || "The microphone is off. Start it and sing: your pitch draws here as a line."}
          </p>
        )}
        {listening && micMessage && <p className="vocal-graph-empty" role="status">{micMessage}</p>}
        {children}
      </div>
    </div>
  );
}
