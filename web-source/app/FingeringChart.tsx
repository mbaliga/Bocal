"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Info, Lightbulb, ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import StaffNote from "./StaffNote";
import type { InstrumentProfile } from "./instruments";
import { fullNoteLabel, type NotationSystem } from "./notation";
import type { ChartKey, Fingering, FingeringChart as FingeringChartData } from "./fingering-charts";

/**
 * The 2D fingering-chart diagram: an SVG keyed off `chart.keys`' normalised
 * 0-100 layout, a note selector built on the existing staff renderer, left
 * and right stepping, and a small choice group when a note has a universal
 * alternate. Every chart passed in carries the same `review` disclosure
 * (see fingering-charts/types.ts), shown here as a badge and a one-line
 * truth card in the same voice as the sax lab's "Not checked yet" card.
 */

function KeyGlyph({ chartKey, state }: { chartKey: ChartKey; state: "pressed" | "half" | "open" }) {
  const r = chartKey.r ?? 5.5;
  const shape = chartKey.shape ?? "round";
  const cx = chartKey.x;
  const cy = chartKey.y;
  const commonStroke = { stroke: "currentColor", strokeWidth: 0.9 as const };

  if (shape === "round") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="none" className="chart-key-ring" {...commonStroke} />
        {state === "pressed" && <circle cx={cx} cy={cy} r={r - 1.1} className="chart-key-fill" />}
        {state === "half" && (
          <path d={`M ${cx - (r - 1.1)} ${cy} A ${r - 1.1} ${r - 1.1} 0 0 1 ${cx + (r - 1.1)} ${cy} Z`} className="chart-key-fill" />
        )}
      </g>
    );
  }

  // "pill" and "lever" both render as a rounded rect; a lever is narrower,
  // reading as the small side/pinky/thumb touch-pieces it stands for.
  const w = shape === "pill" ? r * 2.3 : r * 1.7;
  const h = r * 1.5;
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={h / 2} fill="none" className="chart-key-ring" {...commonStroke} />
      {state === "pressed" && <rect x={cx - w / 2 + 1} y={cy - h / 2 + 1} width={w - 2} height={h - 2} rx={(h - 2) / 2} className="chart-key-fill" />}
      {state === "half" && (
        <rect x={cx - w / 2 + 1} y={cy - h / 2 + 1} width={(w - 2) / 2} height={h - 2} rx={2} className="chart-key-fill" />
      )}
    </g>
  );
}

function ChartDiagram({ chart, activeKeys, halfKeys }: { chart: FingeringChartData; activeKeys: Set<string>; halfKeys: Set<string> }) {
  const titleId = useId();
  return (
    <svg className="chart-svg" viewBox="0 0 100 100" role="img" aria-labelledby={titleId} preserveAspectRatio="xMidYMid meet">
      <title id={titleId}>Fingering diagram</title>
      <line x1={50} y1={2} x2={50} y2={98} className="chart-spine" />
      {chart.keys.map((key) => (
        <g key={key.id} className={`chart-key hand-${key.hand}`}>
          <KeyGlyph chartKey={key} state={activeKeys.has(key.id) ? "pressed" : halfKeys.has(key.id) ? "half" : "open"} />
        </g>
      ))}
    </svg>
  );
}

export function FingeringChart({
  chart,
  instrument,
  notation,
  tonic,
  chartOwnerName,
}: {
  chart: FingeringChartData;
  instrument: InstrumentProfile;
  notation: NotationSystem;
  tonic: number;
  /** Set when this chart belongs to a different instrument (cor anglais borrowing the oboe's). */
  chartOwnerName?: string;
}) {
  const initialIndex = Math.floor(chart.fingerings.length / 3);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [choiceIndex, setChoiceIndex] = useState(0);

  const selected = chart.fingerings[Math.min(selectedIndex, chart.fingerings.length - 1)];
  const choices = useMemo(() => choicesFor(selected), [selected]);
  const choice = choices[Math.min(choiceIndex, choices.length - 1)];
  const activeKeys = useMemo(() => new Set(choice.keys), [choice]);
  const halfKeys = useMemo(() => new Set(choice.halfKeys ?? []), [choice]);

  const chooseNote = useCallback((index: number) => {
    const wrapped = (index + chart.fingerings.length) % chart.fingerings.length;
    setSelectedIndex(wrapped);
    setChoiceIndex(0);
  }, [chart.fingerings.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") chooseNote(selectedIndex + 1);
      if (event.key === "ArrowLeft") chooseNote(selectedIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseNote, selectedIndex]);

  const concertMidi = selected.writtenMidi - instrument.writtenOffset;
  const writtenLabel = fullNoteLabel(selected.writtenMidi, notation, tonic);
  const concertLabel = fullNoteLabel(concertMidi, "western");
  const pressedDetails = chart.keys.filter((key) => activeKeys.has(key.id));
  const halfDetails = chart.keys.filter((key) => halfKeys.has(key.id));

  return (
    <div className="fingering-chart">
      <div className="chart-review-badge"><ShieldQuestion size={13} /> Method-book consensus, not yet teacher-reviewed</div>
      {chartOwnerName && (
        <div className="lab-instrument-notice">
          <Info size={15} />
          <p>This is the {chartOwnerName}&apos;s fingering chart. {instrument.name} shares the same key system, but no one has checked that every fingering here also applies note-for-note on {instrument.name.toLowerCase()}.</p>
        </div>
      )}

      <div className="note-browser" aria-label="Written note selector">
        <button className="note-arrow" aria-label="Previous note" onClick={() => chooseNote(selectedIndex - 1)}><ChevronLeft size={18} /></button>
        <div className="note-scroll">
          {chart.fingerings.map((fingering, index) => (
            <button
              key={fingering.id}
              className={index === selectedIndex ? "is-active" : ""}
              onClick={() => chooseNote(index)}
              aria-label={fullNoteLabel(fingering.writtenMidi, notation, tonic)}
            >
              {fullNoteLabel(fingering.writtenMidi, notation, tonic)}
            </button>
          ))}
        </div>
        <button className="note-arrow" aria-label="Next note" onClick={() => chooseNote(selectedIndex + 1)}><ChevronRight size={18} /></button>
      </div>

      <div className="chart-workspace">
        <div className="chart-stage">
          <div className="chart-staff-slot"><StaffNote midi={selected.writtenMidi} clef={instrument.clef} height={64} title={writtenLabel} /></div>
          <ChartDiagram chart={chart} activeKeys={activeKeys} halfKeys={halfKeys} />
          <div className="chart-legend" aria-hidden="true">
            <span><i className="legend-pressed" /> Press</span>
            <span><i className="legend-half" /> Half-hole</span>
            <span><i className="legend-open" /> Open</span>
          </div>
        </div>

        <aside className="chart-panel">
          <div className="pitch-pair">
            <div><small>Written</small><strong>{writtenLabel}</strong></div>
            <ArrowRight size={18} />
            <div><small>Concert pitch</small><strong>{concertLabel}</strong></div>
          </div>

          {choices.length > 1 && (
            <div className="fingering-choices" aria-label="Primary and alternate fingerings">
              <small>Fingering route</small>
              <div>
                {choices.map((option, index) => (
                  <button key={option.label} className={index === choiceIndex ? "is-active" : ""} onClick={() => setChoiceIndex(index)}>{option.label}</button>
                ))}
              </div>
              {choice.useWhen && <p><Info size={13} /> {choice.useWhen}</p>}
            </div>
          )}

          <div className="finger-hint"><Lightbulb size={16} /><p>{choice.hint}</p></div>

          <div className="pressed-section">
            <div className="pressed-heading"><span>Keys pressed</span><strong>{pressedDetails.length}</strong></div>
            {pressedDetails.length === 0 && halfDetails.length === 0 ? (
              <div className="open-fingering">Fully open -- no keys pressed.</div>
            ) : (
              <div className="chart-key-list">
                {pressedDetails.map((key) => <span key={key.id} className="chart-key-chip">{key.label}</span>)}
                {halfDetails.map((key) => <span key={key.id} className="chart-key-chip is-half">{key.label} (half)</span>)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function choicesFor(fingering: Fingering) {
  return [
    { label: "Primary", keys: fingering.keys, halfKeys: fingering.halfKeys, hint: fingering.hint, useWhen: undefined as string | undefined },
    ...(fingering.alternates ?? []).map((alternate) => ({
      label: alternate.label,
      keys: alternate.keys,
      halfKeys: alternate.halfKeys,
      hint: alternate.hint,
      useWhen: alternate.useWhen as string | undefined,
    })),
  ];
}
