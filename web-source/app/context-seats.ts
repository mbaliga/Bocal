// The upper dock pill, as data.
//
// The pill used to hold the current instrument and the one put down last,
// which only repeated the header's instrument picker. It is now a two-seat
// view switch for whichever workspace is on screen, and every seat below
// drives a control that workspace already has. This module is the single
// place that says which two seats a workspace gets; page.tsx renders them and
// hands the chosen one to the workspace.
//
// Pure on purpose (no React, no DOM, no storage) so a plain node test can walk
// every workspace against every instrument.

import type { InstrumentId } from "./instruments";

export type WorkspaceMode = "tune" | "sax" | "pulse" | "analyze" | "practice";

export const WORKSPACE_MODES: readonly WorkspaceMode[] = ["tune", "sax", "pulse", "analyze", "practice"];

export type Seat = {
  /** Stable id; this is the value stored for the workspace and handed to the view. */
  id: string;
  /** What the pill shows. Ten characters at most, so two fit the 178 px pill. */
  label: string;
  /** Longer hover text and screen-reader name. */
  title?: string;
  /**
   * The id of a real section in the workspace to scroll to when the seat is
   * chosen. The workspace puts this id on the section; the heading inside it
   * takes focus.
   */
  section?: string;
  /** A seat that does not change the view but opens another workspace. */
  opens?: WorkspaceMode;
};

export const MAX_SEAT_LABEL_LENGTH = 10;

/** Which analysis views the live-analysis workspace can be showing. */
export const ANALYSIS_VIEW_IDS = ["waveform", "spectrum", "harmonics", "spectrogram"] as const;

/** The oboe lab's four camera presets, in the order the lab lists them. */
export const OBOE_VIEW_IDS = ["front", "left", "right", "back"] as const;

type Workspace = {
  /** Every value that may be stored for this workspace (the seats' ids, plus views the in-view controls can reach). */
  values: readonly string[];
  /** True when the seat is stored elsewhere (the tuner's written/concert setting has its own key). */
  external?: boolean;
};

const WORKSPACES: Record<string, Workspace> = {
  "tune:pitch": { values: ["written", "concert"], external: true },
  "tune:view": { values: ["tuner", "tone"] },
  "lab:sax": { values: ["learn", "challenge"] },
  "lab:oboe": { values: OBOE_VIEW_IDS },
  "lab:chart": { values: ["chart"] },
  "lab:harmonica": { values: ["chart"] },
  "lab:chromatic": { values: ["out", "in"] },
  "lab:vocal": { values: ["graph", "warmups"] },
  "lab:guitar": { values: ["tuner", "chords"] },
  pulse: { values: ["metronome", "sequences"] },
  analyze: { values: ANALYSIS_VIEW_IDS },
  practice: { values: ["today", "log"] },
};

/** Keys the persisted map may hold. */
export const CONTEXT_SEAT_KEYS: readonly string[] = Object.keys(WORKSPACES).filter((key) => !WORKSPACES[key].external);

type SeatInstrument = { id: InstrumentId; writtenOffset: number; labTier: string };

/** The workspace a (mode, instrument) pair is showing, as a storage key. */
export function contextKeyFor(mode: WorkspaceMode, instrument: SeatInstrument): string {
  switch (mode) {
    case "tune":
      return instrument.writtenOffset !== 0 ? "tune:pitch" : "tune:view";
    case "pulse":
      return "pulse";
    case "analyze":
      return "analyze";
    case "practice":
      return "practice";
    case "sax":
      if (instrument.id === "guitar") return "lab:guitar";
      if (instrument.id === "vocal") return "lab:vocal";
      if (instrument.id === "chromatic-harmonica") return "lab:chromatic";
      if (instrument.labTier === "harmonica") return "lab:harmonica";
      if (instrument.labTier === "anatomy") return "lab:oboe";
      if (instrument.labTier === "chart") return "lab:chart";
      return "lab:sax";
  }
}

const SEATS: Record<string, [Seat, Seat]> = {
  "tune:pitch": [
    { id: "written", label: "Written", title: "Show the note you read on the page" },
    { id: "concert", label: "Concert", title: "Show the pitch that actually sounds" },
  ],
  "tune:view": [
    { id: "tuner", label: "Tuner", title: "Back to the tuner", section: "ctx-tune-top" },
    { id: "tone", label: "Tone", title: "Go to the tone generator", section: "ctx-tone-generator" },
  ],
  "lab:sax": [
    { id: "learn", label: "Learn", title: "Pick a note and see its fingering" },
    { id: "challenge", label: "Challenge", title: "Build the fingering for a note you are given" },
  ],
  "lab:oboe": [
    { id: "front", label: "Front", title: "View the instrument from the front" },
    { id: "left", label: "Left", title: "View the instrument from the left" },
  ],
  "lab:chart": [
    { id: "chart", label: "Chart", title: "Go to the fingering chart", section: "ctx-lab-chart" },
    { id: "tune", label: "Tune", title: "Open the tuner", opens: "tune" },
  ],
  "lab:harmonica": [
    { id: "chart", label: "Chart", title: "Go to the harmonica chart", section: "ctx-lab-chart" },
    { id: "tune", label: "Tune", title: "Open the tuner", opens: "tune" },
  ],
  "lab:chromatic": [
    { id: "out", label: "Slide out", title: "Slide out: the plain notes" },
    { id: "in", label: "Slide in", title: "Slide in: every note a semitone up" },
  ],
  "lab:vocal": [
    { id: "graph", label: "Graph", title: "Go to the live pitch graph", section: "ctx-vocal-graph" },
    { id: "warmups", label: "Warm-ups", title: "Go to the guided warm-up", section: "ctx-vocal-warmups" },
  ],
  "lab:guitar": [
    { id: "tuner", label: "Tuner", title: "Go to the string tuner", section: "ctx-guitar-tuner" },
    { id: "chords", label: "Chords", title: "Go to the chord player", section: "ctx-guitar-chords" },
  ],
  pulse: [
    { id: "metronome", label: "Metronome", title: "Go to the metronome", section: "ctx-pulse-metronome" },
    { id: "sequences", label: "Sequences", title: "Go to the sequence builder", section: "ctx-pulse-sequences" },
  ],
  analyze: [
    { id: "waveform", label: "Waveform", title: "Show the live waveform" },
    { id: "spectrum", label: "Spectrum", title: "Show the live spectrum" },
  ],
  practice: [
    { id: "today", label: "Today", title: "Go to today's plan", section: "ctx-practice-today" },
    { id: "log", label: "Log", title: "Go to the practice log", section: "ctx-practice-log" },
  ],
};

/** The two seats for the workspace on screen. The left seat is the default. */
export function contextSeatsFor(mode: WorkspaceMode, instrument: SeatInstrument): [Seat, Seat] {
  return SEATS[contextKeyFor(mode, instrument)];
}

/** The value a workspace starts on: its left seat. */
export function defaultContextSeat(key: string): string {
  return SEATS[key][0].id;
}

/**
 * The stored seat for a workspace, or the left seat when nothing valid is
 * stored. The result may be a view the pill has no seat for (the analysis
 * view can be on Harmonics from its own buttons); then neither seat reads as
 * pressed, which is the truth.
 */
export function resolveContextSeat(key: string, stored: Record<string, string>): string {
  const workspace = WORKSPACES[key];
  const value = Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : undefined;
  return workspace && typeof value === "string" && workspace.values.indexOf(value) >= 0 ? value : defaultContextSeat(key);
}

/**
 * Reads the persisted map (a JSON string, or the parsed value). Unknown
 * workspace keys, values that are not strings and values the workspace does
 * not have are dropped, so a hand-edited or older entry cannot break a view.
 */
export function sanitiseContextSeats(raw: unknown): Record<string, string> {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const out: Record<string, string> = {};
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return out;
  const source = parsed as Record<string, unknown>;
  for (const key of CONTEXT_SEAT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (typeof value === "string" && WORKSPACES[key].values.indexOf(value) >= 0) out[key] = value;
  }
  return out;
}

export function serialiseContextSeats(seats: Record<string, string>): string {
  return JSON.stringify(sanitiseContextSeats(seats));
}

/** Parser for usePersistedSetting: undefined keeps the empty default. */
export function parseContextSeats(raw: string | null): Record<string, string> | undefined {
  return raw === null ? undefined : sanitiseContextSeats(raw);
}
