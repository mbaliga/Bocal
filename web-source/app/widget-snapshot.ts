// What the Android home-screen widgets show, as data.
//
// Practice data lives in this WebView's localStorage, which native code cannot
// read. So the web app hands the Android shell one small summary whenever the
// data behind a widget changes (practice minutes, the weekly goal, the
// instrument and its A4, the songs being studied, the session timer), and the
// shell keeps it under its no-backup files and redraws the widgets from it.
//
// The summary carries only what a home screen may show. Activity labels and
// notes (which a player can type), lesson notes, coach plans, takes and the
// equipment log never leave the page. Song titles do, because the "Now
// studying" widget exists to show one, and the widget can hide them.
//
// Minutes are sent per day rather than as one "this week" total, so the
// shell can recompute the last seven days on the day it draws: a widget
// looked at on Friday must not show Monday's window just because Bocal was
// last opened on Monday.
//
// The builder is pure (no DOM, no storage) so a plain node test can pin it;
// the reader and publisher below it are the only parts that touch the page.

import { useEffect } from "react";
import { FINGERING_CHARTS, HARMONICA_CHARTS } from "./fingering-charts";
import { INSTRUMENTS, isInstrumentId, type InstrumentId } from "./instruments";
import {
  PRACTICE_ACTIVITY_STORAGE_KEY,
  SONG_WISHLIST_STORAGE_KEY,
  parsePracticeActivities,
  parseSessions,
  parseSongWishlist,
  type PracticeActivity,
  type PracticeActivityType,
  type SessionRecord,
  type SongWish,
} from "./practice-data";
import { SESSIONS_STORAGE_KEY, WEEKLY_GOAL_STORAGE_KEY } from "./storage-keys";
import { REFERENCE_HZ_DEFAULT, REFERENCE_HZ_MAX, REFERENCE_HZ_MIN, TEMPERAMENT_PROFILES } from "./tuning";

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;
/** Days sent per snapshot: today and the six before it, the window the Practice goal ring uses. */
export const WIDGET_SNAPSHOT_DAYS = 7;
/** Newest practice-log rows sent; the largest log widget shows five. */
export const WIDGET_SNAPSHOT_RECENT = 5;
/** Songs marked Studying that are sent by title; the largest widget shows three. */
export const WIDGET_SNAPSHOT_SONGS = 3;
/** The weekly goal the Practice screen falls back to when none is stored. */
export const DEFAULT_WEEKLY_GOAL_MINUTES = 60;

/** Fired after the weekly goal is stored, so the widgets can follow it. */
export const WEEKLY_GOAL_EVENT = "bocal-weekly-goal";
/** Fired after the header's session timer stores a run. */
export const SESSIONS_EVENT = "bocal-sessions";
/** Fired by the Android shell when a home-screen widget asks to open a workspace. */
export const HOST_OPEN_EVENT = "bocal:host-open";

/** Every event after which the stored practice data may have changed. */
const DATA_EVENTS = ["bocal-practice-activity", "bocal-song-wishlist", WEEKLY_GOAL_EVENT, SESSIONS_EVENT, "storage"] as const;

export type WidgetDay = {
  /** Local calendar day, YYYY-MM-DD, the same key the Practice screen buckets by. */
  date: string;
  /** Logged practice activity, every type (what the goal ring counts). */
  seconds: number;
  /** Of which Pulse (metronome and rhythm drills). */
  pulseSeconds: number;
  /** The header's session timer, kept separately as the app does. */
  timerSeconds: number;
};

export type WidgetSnapshot = {
  schemaVersion: typeof WIDGET_SNAPSHOT_SCHEMA_VERSION;
  /** Epoch milliseconds. The widgets print it as "as of", because Bocal only publishes while it runs. */
  publishedAt: number;
  weeklyGoalMinutes: number;
  days: WidgetDay[];
  /** Newest first. Type and length only: never the label or notes. */
  recent: { type: PracticeActivityType; seconds: number; capturedAt: number }[];
  /** When the newest Pulse activity was logged, epoch milliseconds. */
  lastPulseAt: number | null;
  instrument: {
    id: InstrumentId;
    name: string;
    shortName: string;
    family: string;
    pitchLabel: string;
    writtenOffset: number;
    /** What the second workspace is called for this instrument (Lab, Chart, Vocal, Strings). */
    labLabel: string;
    labStatus: string;
    /** The chart's own review badge, or null when the instrument has no chart. */
    review: string | null;
  };
  tuning: { referenceHz: number; temperament: string };
  songs: { studying: { title: string; progress: number }[]; studyingCount: number; wishlistCount: number };
};

export type WidgetSnapshotInput = {
  now: Date;
  activities: PracticeActivity[];
  sessions: SessionRecord[];
  songs: SongWish[];
  weeklyGoalMinutes: number;
  instrumentId: InstrumentId;
  labLabel: string;
  referenceHz: number;
  temperament: string;
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayKeyOf(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dayKey(date) : "";
}

/** Same window as the Practice screen: today and the six days before it, oldest first. */
export function widgetWindow(now: Date): string[] {
  return Array.from({ length: WIDGET_SNAPSHOT_DAYS }, (_, index) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (WIDGET_SNAPSHOT_DAYS - 1 - index), 12)));
}

function nonNegative(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
}

function isHiddenControl(code: number) {
  return code < 0x20
    || (code >= 0x7f && code <= 0x9f)
    || code === 0x200e || code === 0x200f
    || (code >= 0x202a && code <= 0x202e)
    || (code >= 0x2066 && code <= 0x2069);
}

/** One line of plain text: no control or direction-override characters, single spaces, at most `max` characters. */
export function plainText(value: string, max: number): string {
  const visible = Array.from(value, (char) => (isHiddenControl(char.codePointAt(0) ?? 0) ? " " : char)).join("");
  return Array.from(visible.replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

/** The stored weekly goal as the Practice screen reads it, with its default for anything unusable. */
export function sanitiseWeeklyGoal(raw: string | null | undefined): number {
  const value = Number(raw ?? DEFAULT_WEEKLY_GOAL_MINUTES);
  return Number.isFinite(value) && value >= 1 && value <= 10_080 ? Math.round(value) : DEFAULT_WEEKLY_GOAL_MINUTES;
}

function reviewFor(instrumentId: InstrumentId): string | null {
  const review = FINGERING_CHARTS[instrumentId]?.review ?? HARMONICA_CHARTS[instrumentId]?.review;
  if (!review) return null;
  const text = plainText(review, 120);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

function songTime(song: SongWish) {
  const time = Date.parse(song.updatedAt ?? song.addedAt);
  return Number.isFinite(time) ? time : 0;
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const days: WidgetDay[] = widgetWindow(input.now).map((date) => ({ date, seconds: 0, pulseSeconds: 0, timerSeconds: 0 }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const activity of input.activities) {
    const day = byDate.get(dayKeyOf(activity.capturedAt));
    if (!day) continue;
    const seconds = nonNegative(activity.seconds);
    day.seconds += seconds;
    if (activity.type === "rhythm") day.pulseSeconds += seconds;
  }
  for (const session of input.sessions) {
    const day = byDate.get(dayKeyOf(session.date));
    if (day) day.timerSeconds += nonNegative(session.seconds);
  }

  const dated = input.activities
    .map((activity) => ({ activity, at: Date.parse(activity.capturedAt) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((left, right) => right.at - left.at);
  const recent = dated.slice(0, WIDGET_SNAPSHOT_RECENT).map(({ activity, at }) => ({
    type: activity.type,
    seconds: nonNegative(activity.seconds),
    capturedAt: at,
  }));
  const lastPulse = dated.find((entry) => entry.activity.type === "rhythm");

  const instrument = INSTRUMENTS[input.instrumentId];
  const studying = input.songs
    .filter((song) => song.status === "studying")
    .sort((left, right) => songTime(right) - songTime(left));
  const temperament = plainText(input.temperament, 40);

  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    publishedAt: input.now.getTime(),
    weeklyGoalMinutes: input.weeklyGoalMinutes,
    days,
    recent,
    lastPulseAt: lastPulse ? lastPulse.at : null,
    instrument: {
      id: instrument.id,
      name: plainText(instrument.name, 60),
      shortName: plainText(instrument.shortName, 30),
      family: plainText(instrument.family, 30),
      pitchLabel: plainText(instrument.pitchLabel, 8),
      writtenOffset: instrument.writtenOffset,
      labLabel: plainText(input.labLabel, 20),
      labStatus: plainText(instrument.labStatus, 120),
      review: reviewFor(instrument.id),
    },
    tuning: {
      referenceHz: Number.isFinite(input.referenceHz) && input.referenceHz >= REFERENCE_HZ_MIN && input.referenceHz <= REFERENCE_HZ_MAX
        ? input.referenceHz
        : REFERENCE_HZ_DEFAULT,
      temperament: temperament || TEMPERAMENT_PROFILES.equal.label,
    },
    songs: {
      studying: studying.slice(0, WIDGET_SNAPSHOT_SONGS).map((song) => ({
        title: plainText(song.title, 100),
        progress: typeof song.progress === "number" && Number.isFinite(song.progress) ? Math.max(0, Math.min(100, Math.round(song.progress))) : 0,
      })).filter((song) => song.title),
      studyingCount: studying.length,
      wishlistCount: input.songs.filter((song) => song.status === "wishlist").length,
    },
  };
}

/** A place a home-screen widget may open. Anything else the shell hands over is ignored. */
export type HostDestination = { mode: "tune" | "sax" | "pulse" | "practice"; seat?: string; section?: string };

const HOST_DESTINATIONS: Record<string, HostDestination> = {
  tune: { mode: "tune" },
  "tune:tone": { mode: "tune", seat: "tone", section: "ctx-tone-generator" },
  lab: { mode: "sax" },
  pulse: { mode: "pulse" },
  "pulse:metronome": { mode: "pulse", seat: "metronome", section: "ctx-pulse-metronome" },
  "pulse:sequences": { mode: "pulse", seat: "sequences", section: "ctx-pulse-sequences" },
  "pulse:drone": { mode: "pulse", section: "ctx-pulse-drone" },
  practice: { mode: "practice" },
  "practice:today": { mode: "practice", seat: "today", section: "ctx-practice-today" },
  "practice:log": { mode: "practice", seat: "log", section: "ctx-practice-log" },
  "practice:songs": { mode: "practice", section: "ctx-practice-songs" },
};

export const HOST_DESTINATION_IDS: readonly string[] = Object.keys(HOST_DESTINATIONS);

export function hostDestination(raw: unknown): HostDestination | null {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(HOST_DESTINATIONS, raw) ? HOST_DESTINATIONS[raw] : null;
}

type StorageReader = Pick<Storage, "getItem">;

function read(storage: StorageReader, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Everything the snapshot needs from localStorage, each key read on its own so one bad value can't blank the rest. */
export function readWidgetStorage(storage: StorageReader) {
  return {
    activities: parsePracticeActivities(read(storage, PRACTICE_ACTIVITY_STORAGE_KEY)),
    sessions: parseSessions(read(storage, SESSIONS_STORAGE_KEY)),
    songs: parseSongWishlist(read(storage, SONG_WISHLIST_STORAGE_KEY)),
    weeklyGoalMinutes: sanitiseWeeklyGoal(read(storage, WEEKLY_GOAL_STORAGE_KEY)),
  };
}

export type WidgetPageContext = { instrumentId: InstrumentId; labLabel: string; referenceHz: number; temperament: string };

/** Hands the current summary to the Android shell. A no-op in a browser, where there are no widgets. */
export function publishWidgetSnapshot(context: WidgetPageContext): boolean {
  if (typeof window === "undefined") return false;
  const host = window.bocalHost;
  if (typeof host?.publishWidgetSnapshot !== "function" || !isInstrumentId(context.instrumentId)) return false;
  try {
    const snapshot = buildWidgetSnapshot({ ...readWidgetStorage(window.localStorage), ...context, now: new Date() });
    return host.publishWidgetSnapshot(JSON.stringify(snapshot)) === true;
  } catch {
    // Widgets are a convenience; practice carries on without them.
    return false;
  }
}

/**
 * Republishes after any practice-data event (coalesced), whenever the
 * instrument, A4 or temperament changes, and at once when the shell pauses
 * the page, so the widgets' "as of" time is the moment Bocal was left.
 */
export function useWidgetSnapshotPublisher(context: WidgetPageContext) {
  const { instrumentId, labLabel, referenceHz, temperament } = context;
  useEffect(() => {
    if (typeof window.bocalHost?.publishWidgetSnapshot !== "function") return;
    const current = { instrumentId, labLabel, referenceHz, temperament };
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => publishWidgetSnapshot(current), 300);
    };
    const flush = () => {
      window.clearTimeout(timer);
      publishWidgetSnapshot(current);
    };
    for (const name of DATA_EVENTS) window.addEventListener(name, schedule);
    window.addEventListener("bocal:host-pause", flush);
    schedule();
    return () => {
      window.clearTimeout(timer);
      for (const name of DATA_EVENTS) window.removeEventListener(name, schedule);
      window.removeEventListener("bocal:host-pause", flush);
    };
  }, [instrumentId, labLabel, referenceHz, temperament]);
}
