"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Lightbulb, Mic, ShieldAlert, ShieldQuestion, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/harmonica.css";
import StaffNote from "./StaffNote";
import { useSeatSync } from "./context-scroll";
import { centerNoteInStrip } from "./horizontal-scroll";
import type { InstrumentProfile } from "./instruments";
import { midiToHz } from "./music-math";
import { fullNoteLabel, type NotationSystem } from "./notation";
import { usePersistedSetting } from "./usePersistedSetting";
import { HARMONICA_KEY_STORAGE_KEY } from "./storage-keys";
import {
  buildDiatonicHarmonicaChart,
  CHROMATIC_HARMONICA_CHART,
  DEFAULT_HARMONICA_KEY,
  HARMONICA_KEYS,
  sanitiseHarmonicaKey,
  type HarmonicaChartData,
  type HarmonicaKeyId,
  type HarmonicaNote,
} from "./fingering-charts";
import { bendName, describeHarmonicaNote, harmonicaKeyLabel, playableMidis, routesForMidi } from "./fingering-charts/harmonica";

/**
 * The harmonica lab: a hole-and-breath comb instead of a key diagram. Blow
 * row on top, draw row below, bends listed under the cell they bend down
 * from, so the rows read the way harmonica tab does. The selected note's
 * hole and direction are highlighted, "Hear it" plays the sounding pitch on
 * the AudioContext clock, and the tuner's locked note lights the hole the
 * player is on.
 *
 * The chart is computed from the standard layout, not reviewed by a teacher,
 * and says so (see fingering-charts/harmonica.ts).
 */

export type HarmonicaTunerReading = { midi: number; cents: number };

export type HarmonicaChartProps = {
  instrument: InstrumentProfile;
  notation: NotationSystem;
  tonic: number;
  onBack: () => void;
  reading: HarmonicaTunerReading | null;
  listening: boolean;
  onListen: () => void;
  /** Chromatic only: the slide position ("out" | "in") the dock pill holds, and how the chart reports its own change. Both optional. */
  seat?: string;
  onSeatChange?: (next: string) => void;
};

const parseKey = (raw: string | null): HarmonicaKeyId | undefined => (raw === null ? undefined : sanitiseHarmonicaKey(raw));
const serialiseKey = (value: HarmonicaKeyId) => value;

function bendTag(bend: number) {
  return bend === 1 ? "−½" : bend === 2 ? "−1" : "−1½";
}

function rowLabel(kind: "blow" | "draw", index: number, bends: number) {
  if (index === 0) return kind === "blow" ? "Blow" : "Draw";
  if (index <= bends) return `Bend ${bendTag(index)}`;
  return kind === "blow" ? "Overblow" : "Overdraw";
}

function HarmonicaChartBody({
  instrument,
  notation,
  tonic,
  onBack,
  reading,
  listening,
  onListen,
  seat,
  onSeatChange,
}: HarmonicaChartProps) {
  const isChromatic = instrument.id === "chromatic-harmonica";
  const [keyId, setKeyId] = usePersistedSetting<HarmonicaKeyId>(HARMONICA_KEY_STORAGE_KEY, parseKey, DEFAULT_HARMONICA_KEY, serialiseKey);
  const chart: HarmonicaChartData = useMemo(
    () => (isChromatic ? CHROMATIC_HARMONICA_CHART : buildDiatonicHarmonicaChart(keyId)),
    [isChromatic, keyId],
  );
  const hasAdvanced = useMemo(() => chart.notes.some((note) => note.advanced), [chart]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState(isChromatic ? "1b" : "4b0");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeStripRef = useRef<HTMLButtonElement | null>(null);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  const visibleMidis = useMemo(() => playableMidis(chart, showAdvanced), [chart, showAdvanced]);

  // What the tuner currently hears, as notes this chart can play.
  const detectedMidi = reading ? Math.round(reading.midi) : null;
  const detectedRoutes = useMemo(
    () => (detectedMidi === null ? [] : routesForMidi(chart, detectedMidi, showAdvanced)),
    [chart, detectedMidi, showAdvanced],
  );
  const following = follow && detectedRoutes.length > 0;

  const manual = chart.notes.find((note) => note.id === selectedId) ?? chart.notes[0];
  const active: HarmonicaNote = following ? detectedRoutes[0] : manual;
  // A hidden overblow cannot stay selected once the advanced toggle is off.
  const shown: HarmonicaNote = active.advanced && !showAdvanced ? routesForMidi(chart, active.midi, false)[0] ?? chart.notes[0] : active;
  const slideView = isChromatic ? (following ? Boolean(shown.slide) : slideIn) : false;
  const routes = routesForMidi(chart, shown.midi, showAdvanced);

  const select = useCallback((note: HarmonicaNote) => {
    setSelectedId(note.id);
    setFollow(false);
    if (isChromatic) setSlideIn(Boolean(note.slide));
  }, [isChromatic]);

  // Slide toggle: move the selection to the same hole and breath at the
  // other slide position, so the highlight stays on the same cell.
  const toggleSlide = useCallback(() => {
    const next = !slideView;
    const twin = chart.notes.find((note) => note.hole === shown.hole && note.breath === shown.breath && note.bend === 0 && Boolean(note.slide) === next);
    setSlideIn(next);
    setFollow(false);
    if (twin) setSelectedId(twin.id);
  }, [chart, shown.hole, shown.breath, slideView]);

  // The dock pill's Slide out / Slide in seats and the chart's own slide
  // toggle are one switch; a chart that cannot slide ignores the pill.
  useSeatSync<string>(
    isChromatic && (seat === "in" || seat === "out") ? seat : undefined,
    slideView ? "in" : "out",
    (next) => { if ((next === "in") !== slideView) toggleSlide(); },
    isChromatic ? onSeatChange : undefined,
  );

  const selectMidi = useCallback((midi: number) => {
    const first = routesForMidi(chart, midi, showAdvanced)[0];
    if (first) select(first);
  }, [chart, showAdvanced, select]);

  const stepNote = useCallback((delta: number) => {
    const index = visibleMidis.indexOf(shown.midi);
    const next = visibleMidis[(index + delta + visibleMidis.length) % visibleMidis.length];
    selectMidi(next);
  }, [visibleMidis, shown.midi, selectMidi]);

  // Left and right step the note strip, scoped to this container (a global
  // handler collided with the page's workspace shortcuts, see FingeringChart).
  // Native controls keep their own arrow keys.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT")) return;
      event.preventDefault();
      event.stopPropagation();
      stepNote(event.key === "ArrowRight" ? 1 : -1);
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [stepNote]);

  useEffect(() => {
    centerNoteInStrip(activeStripRef.current);
    centerNoteInStrip(activeCellRef.current);
  }, [shown.id, shown.midi]);

  // Reference tone at the sounding pitch, on the AudioContext clock (no
  // timers): same one-context-per-workspace shape as the other charts'
  // "Hear it" -- created on the tap, closed on unmount.
  const hearIt = useCallback(async () => {
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = midiToHz(shown.midi);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.92);
  }, [shown.midi]);

  const label = (midi: number) => fullNoteLabel(midi, notation, tonic);
  const detectedIds = useMemo(() => new Set(detectedRoutes.map((note) => note.id)), [detectedRoutes]);

  // Comb geometry: one column per hole, a plain-note row per breath, then
  // that breath's bends and (when shown) its overblow or overdraw.
  const holes = Array.from({ length: chart.holes }, (_, index) => index + 1);
  const cellFor = (hole: number, breath: "blow" | "draw", depth: number): HarmonicaNote | undefined =>
    chart.notes.find((note) => (
      note.hole === hole && note.breath === breath && note.bend === depth && !note.advanced && Boolean(note.slide) === slideView
    ));
  const advancedFor = (hole: number, breath: "blow" | "draw") =>
    chart.notes.find((note) => note.hole === hole && note.breath === breath && note.advanced);
  const maxBend = (breath: "blow" | "draw") => chart.notes.reduce((most, note) => (note.breath === breath && note.bend > most ? note.bend : most), 0);
  const blowBends = maxBend("blow");
  const drawBends = maxBend("draw");
  const advancedOn = showAdvanced && hasAdvanced;

  const renderRow = (kind: "blow" | "draw", index: number, bends: number) => {
    const isAdvancedRow = index > bends;
    return [
      <span key={`${kind}${index}-label`} className={`hc-rowlabel is-${kind}${index === 0 ? " is-first" : ""}`}>{rowLabel(kind, index, bends)}</span>,
      ...holes.map((hole) => {
        const note = isAdvancedRow ? advancedFor(hole, kind) : cellFor(hole, kind, index);
        if (!note) return <span key={`${kind}${index}-${hole}`} className="hc-empty" aria-hidden="true" />;
        const isSelected = note.id === shown.id;
        const isDetected = detectedIds.has(note.id);
        const classes = [
          "hc-cell",
          `is-${kind}`,
          note.bend > 0 ? "is-bend" : "",
          note.advanced ? "is-advanced" : "",
          isSelected ? "is-selected" : "",
          isDetected ? "is-detected" : "",
          index === 0 ? "is-first" : "",
        ].filter(Boolean).join(" ");
        return (
          <button
            key={note.id}
            ref={isSelected ? activeCellRef : undefined}
            className={classes}
            aria-pressed={isSelected}
            aria-label={`${describeHarmonicaNote(note)}: ${label(note.midi)}${isDetected ? ", the tuner hears this" : ""}`}
            onClick={() => select(note)}
          >
            <b>{label(note.midi)}</b>
            {note.bend > 0 && <i>{bendTag(note.bend)}</i>}
            {note.technique && <i>{note.technique === "overblow" ? "OB" : "OD"}</i>}
          </button>
        );
      }),
    ];
  };

  const blowRows = 1 + blowBends + (advancedOn ? 1 : 0);
  const drawRows = 1 + drawBends + (advancedOn ? 1 : 0);
  const columns = `repeat(${chart.holes}, minmax(46px, 1fr))`;

  const keyLabel = chart.keyId ? harmonicaKeyLabel(chart.keyId) : "C";
  const hint = shown.technique
    ? "Overblows and overdraws are advanced techniques, and the pitch listed is a computed estimate. It depends on the harp's setup and on you, so check it against the tuner."
    : shown.bend > 0
      ? "Bends come from the shape of your mouth and throat, not from the harmonica. Play the plain note first, then slide the pitch down while keeping the breath steady."
      : shown.slide
        ? "Push the slide button in all the way, then play this hole. Every note moves up a semitone."
        : isChromatic
          ? "Slide out: this is the plain note. Keep the slide fully out or fully in so no hole is half covered."
          : "A plain note: single hole, steady breath. Use a relaxed mouth shape that covers one hole only.";

  const tunerLine = !listening
    ? "The tuner is off. Start listening and the hole you are playing lights up here."
    : reading === null
      ? "Listening. Play one steady note and the hole lights up when the tuner locks."
      : detectedRoutes.length > 0
        ? `Tuner hears ${label(detectedMidi as number)} (${reading.cents > 0 ? "+" : ""}${Math.round(reading.cents)}¢): ${detectedRoutes.map(describeHarmonicaNote).join(" or ")}.`
        : `Tuner hears ${label(detectedMidi as number)}, which is not on this chart${showAdvanced || !hasAdvanced ? "" : " without overblows or overdraws"}${isChromatic ? "" : ` for a harp in ${keyLabel}`}.`;

  return (
    <div className="sax-lab-view chart-lab-view harmonica-lab">
      <header className="lab-header">
        <div>
          <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Tuner</button>
          <p className="eyebrow">Harmonica chart · {instrument.name}</p>
          <h1>See which hole, and which breath.</h1>
          <p>Pick a note, or tap a hole on the comb. Blow is the top row and draw the bottom row; bends are listed under the note they bend down from.</p>
        </div>
      </header>

      <div className="harmonica-chart" id="ctx-lab-chart" ref={containerRef} tabIndex={-1}>
        <div className="chart-review-badge"><ShieldQuestion size={13} /> {chart.review}</div>
        <p className="harmonica-caveat">{chart.caveat}</p>

        <div className="harmonica-controls">
          {!isChromatic && (
            <label className="harmonica-key">
              <span>Key of your harmonica</span>
              <select value={keyId} onChange={(event) => setKeyId(sanitiseHarmonicaKey(event.target.value))} aria-label="Harmonica key">
                {HARMONICA_KEYS.map((key) => <option key={key.id} value={key.id}>{key.label}</option>)}
              </select>
            </label>
          )}
          {isChromatic && (
            <button className={`harmonica-toggle${slideView ? " is-on" : ""}`} aria-pressed={slideView} onClick={toggleSlide}>
              Slide in (a semitone up)
            </button>
          )}
          {hasAdvanced && (
            <button className={`harmonica-toggle${showAdvanced ? " is-on" : ""}`} aria-pressed={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
              Overblows and overdraws (advanced, unverified)
            </button>
          )}
          <button className={`harmonica-toggle${follow ? " is-on" : ""}`} aria-pressed={follow} onClick={() => setFollow((value) => !value)}>
            Follow the tuner
          </button>
        </div>

        <div className="note-browser" aria-label="Note selector">
          <button className="note-arrow" aria-label="Previous note" onClick={() => stepNote(-1)}><ChevronLeft size={18} /></button>
          <div className="note-scroll">
            {visibleMidis.map((midi) => (
              <button
                key={midi}
                ref={midi === shown.midi ? activeStripRef : undefined}
                className={midi === shown.midi ? "is-active" : ""}
                aria-pressed={midi === shown.midi}
                aria-label={label(midi)}
                onClick={() => selectMidi(midi)}
              >
                {label(midi)}
              </button>
            ))}
          </div>
          <button className="note-arrow" aria-label="Next note" onClick={() => stepNote(1)}><ChevronRight size={18} /></button>
        </div>

        <div className="chart-workspace">
          <div className="chart-stage harmonica-stage">
            <div className="harmonica-comb" style={{ gridTemplateColumns: `64px ${columns}` }} role="group" aria-label={`${instrument.name} hole chart${chart.keyId ? `, key of ${keyLabel}` : ""}`}>
              <span className="hc-corner" aria-hidden="true">Hole</span>
              {holes.map((hole) => <span key={`h${hole}`} className="hc-hole" aria-hidden="true">{hole}</span>)}
              {Array.from({ length: blowRows }, (_, index) => renderRow("blow", index, blowBends))}
              {Array.from({ length: drawRows }, (_, index) => renderRow("draw", index, drawBends))}
            </div>
            <p className="harmonica-legend" aria-hidden="true">
              <span><i className="hl-selected" /> Selected</span>
              <span><i className="hl-detected" /> Tuner hears</span>
              <span><i className="hl-bend" /> Bend, in whole steps</span>
            </p>
          </div>

          <aside className="chart-panel">
            <div className="harmonica-where">
              <div><small>Note (concert pitch)</small><strong>{label(shown.midi)}</strong></div>
              <div><small>Hole and breath</small><strong>{shown.hole} {shown.breath}</strong></div>
            </div>
            <p className="harmonica-how">
              {describeHarmonicaNote(shown)}
              {shown.bend > 0 && <span> ({bendName(shown.bend)})</span>}
            </p>
            <div className="chart-staff-slot"><StaffNote midi={shown.midi} clef={instrument.clef} height={64} title={label(shown.midi)} /></div>

            <button className="tone-button" onClick={() => void hearIt()}><Volume2 size={17} /> Hear it</button>

            {shown.unverified && (
              <div className="review-badge" title="No published reference was checked for this note.">
                <ShieldAlert size={13} /> Unverified
              </div>
            )}

            {routes.length > 1 && (
              <div className="fingering-choices harmonica-routes" aria-label="Other ways to play this pitch">
                <small>Same pitch, other holes</small>
                <div>
                  {routes.map((route) => (
                    <button key={route.id} className={route.id === shown.id ? "is-active" : ""} aria-pressed={route.id === shown.id} onClick={() => select(route)}>
                      {route.hole} {route.breath}{route.bend > 0 ? ` bend ${bendTag(route.bend)}` : ""}{route.slide ? " slide" : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="finger-hint"><Lightbulb size={16} /><p>{hint}</p></div>

            <div className="harmonica-tuner" aria-live="polite">
              <p>{tunerLine}</p>
              {!listening && <button type="button" onClick={onListen}><Mic size={15} /> Start listening</button>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function HarmonicaChart(props: HarmonicaChartProps) {
  // Keyed by instrument so switching between the two harmonicas resets the
  // selection instead of carrying one chart's note ids into the other.
  return <HarmonicaChartBody key={props.instrument.id} {...props} />;
}
