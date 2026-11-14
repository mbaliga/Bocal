"use client";
import "./native-bridge";
import "./styles/context-pill.css";

import {
  Activity,
  ChevronDown,
  Clock3,
  Columns4,
  Crosshair,
  Guitar,
  LockKeyhole,
  Mic2,
  MoreHorizontal,
  Music2,
  Moon,
  Pause,
  Play,
  Settings2,
  Sun,
  Waves,
  Wind,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisView, type AnalysisMode } from "./AnalysisView";
import { revealSection } from "./context-scroll";
import {
  contextKeyFor,
  contextSeatsFor,
  defaultContextSeat,
  parseContextSeats,
  resolveContextSeat,
  serialiseContextSeats,
  type Seat,
  type WorkspaceMode,
} from "./context-seats";
import {
  BOCAL_ONBOARDING_KEY,
  InstrumentPickerExperience,
  OnboardingGuide,
} from "./InstrumentExperience";
import { GuitarStudio } from "./GuitarStudio";
import { HarmonicaChart } from "./HarmonicaChart";
import { VocalStudio } from "./VocalStudio";
import { CallAndResponse } from "./CallAndResponse";
import { DownloadCenter, type RailSide, type Theme } from "./DownloadCenter";
import { TunerView } from "./TunerView";
import { useTuner } from "./useTuner";
import { usePersistedSetting } from "./usePersistedSetting";
import {
  DAMPING_ORDER,
  SENSITIVITY_ORDER,
  type Damping,
  type Sensitivity,
} from "./pitch-engine";
import { INSTRUMENTS, isInstrumentId, type InstrumentId, type InstrumentProfile } from "./instruments";
import {
  NOTATION_SYSTEMS,
  type NotationSystem,
} from "./notation";
import { PracticeView, PulseView } from "./PracticeTools";
import {
  loadCustomTemperamentCents,
  serializeCustomTemperamentCents,
  REFERENCE_HZ_DEFAULT,
  REFERENCE_HZ_MAX,
  REFERENCE_HZ_MIN,
  TEMPERAMENT_PROFILES,
  type TemperamentId,
  type TuningOptions,
} from "./tuning";
import {
  CONTEXT_SEATS_KEY,
  CUSTOM_TEMPERAMENT_STORAGE_KEY,
  DAMPING_STORAGE_KEY,
  DISPLAY_MODE_STORAGE_KEY,
  HISTORY_MODE_STORAGE_KEY,
  INSTRUMENT_STORAGE_KEY,
  KEY_CENTRE_MODE_STORAGE_KEY,
  NAVIGATION_SIDE_STORAGE_KEY,
  NOTATION_STORAGE_KEY,
  PRECISION_STORAGE_KEY,
  REFERENCE_HZ_STORAGE_KEY,
  SENSITIVITY_STORAGE_KEY,
  SESSIONS_STORAGE_KEY,
  TEMPERAMENT_KEY_STORAGE_KEY,
  TEMPERAMENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TONIC_STORAGE_KEY,
} from "./storage-keys";

// The Android WebView shell (WP7) exposes this bridge as `window.bocalHost`.
// Declared here so the web app can call it defensively ahead of that work
// landing -- every call is optional-chained, so nothing breaks in the
// browser preview or before the native side ships the interface.
const SaxophoneLab = dynamic(
  () => import("./SaxophoneLab").then((module) => module.SaxophoneLab),
  { ssr: false },
);

type Mode = WorkspaceMode;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const navItems: { id: Mode; label: string; icon: typeof Crosshair }[] = [
  { id: "tune", label: "Tune", icon: Crosshair },
  { id: "sax", label: "Lab", icon: Wind },
  { id: "pulse", label: "Pulse", icon: Waves },
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "practice", label: "Practice", icon: Music2 },
];

/**
 * The "sax" nav item's label used to be a hard-coded "3D lab", shown for
 * every instrument including flute, clarinet, bassoon (chart-only -- the
 * chart lab's own header literally says "No 3D model exists yet") and
 * guitar (a 2D chord studio, not a lab at all) -- a11y-ux.md finding
 * "'3D lab' is the tab name for four instruments that have no 3D model".
 * Derived from `labTier` instead so the nav agrees with what's actually
 * behind the tab.
 */
function navLabelFor(itemId: Mode, instrument: InstrumentProfile): string {
  if (itemId !== "sax") return navItems.find((item) => item.id === itemId)?.label ?? "";
  if (instrument.labTier === "fingering" || instrument.labTier === "anatomy") return "Lab";
  if (instrument.labTier === "chart") return "Chart";
  if (instrument.labTier === "harmonica") return "Chart";
  if (instrument.labTier === "vocal") return "Vocal";
  return "Strings";
}

// Everything below derives from the one bar curve "M22 62 Q200 27 378 62"
// (viewBox 400×100; x linear in t, evenly spaced control x's). Seats at
// t = .07/.285/.5/.715/.93 — spread to fill the bar like the reference.
//
// ARC_SEATS: button centers, taken from the Bézier at each t — the row rides the curve.
// ARC_TILTS: the curve's tangent angle at each seat, so icons/labels lie along the arc.
const ARC_SEATS = [
  { left: "11.7%", top: "57.4%" },
  { left: "30.9%", top: "47.7%" },
  { left: "50.0%", top: "44.5%" },
  { left: "69.1%", top: "47.7%" },
  { left: "88.3%", top: "57.4%" },
];
const ARC_TILTS = ["-9.6deg", "-4.83deg", "0deg", "4.83deg", "9.6deg"];

// The workspace view switch rides its own shallower arc so the dock reads as
// two stacked curves, as in the reference. Seats are computed at runtime
// rather than baked in like ARC_SEATS; context-seats.ts decides which two a
// workspace gets.
const PILL_VIEWBOX = { w: 200, h: 48 };
const PILL_PATH = "M16 32 Q100 16 184 32";
const PILL_POINTS: [number, number][] = [[16, 32], [100, 16], [184, 32]];

function pillSeat(index: number, count: number) {
  const t = (index + 0.5) / count;
  const [p0, p1, p2] = PILL_POINTS;
  const at = (a: number, b: number, c: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
  const slope = (a: number, b: number, c: number) => 2 * (1 - t) * (b - a) + 2 * t * (c - b);
  return {
    left: `${(at(p0[0], p1[0], p2[0]) / PILL_VIEWBOX.w) * 100}%`,
    top: `${(at(p0[1], p1[1], p2[1]) / PILL_VIEWBOX.h) * 100}%`,
    tilt: `${(Math.atan2(slope(p0[1], p1[1], p2[1]), slope(p0[0], p1[0], p2[0])) * 180) / Math.PI}deg`,
  };
}

const CUSTOM_TEMPERAMENT_FALLBACK = loadCustomTemperamentCents(null);
const EMPTY_SEATS: Record<string, string> = {};

export default function Home() {
  const [mode, setMode] = useState<Mode>("tune");
  const [instrumentId, setInstrumentId] = useState<InstrumentId>("alto-sax");
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [downloadCenterOpen, setDownloadCenterOpen] = useState(false);
  const [railSide, setRailSide] = useState<RailSide>("left");
  const [theme, setTheme] = useState<Theme>("dark");
  const [notation, setNotation] = usePersistedSetting<NotationSystem>(
    NOTATION_STORAGE_KEY,
    (raw) => (raw && raw in NOTATION_SYSTEMS ? (raw as NotationSystem) : undefined),
    "western",
  );
  const [saTonic, setSaTonic] = usePersistedSetting<number>(
    TONIC_STORAGE_KEY,
    (raw) => {
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value < 12 ? value : undefined;
    },
    0,
  );
  const [referenceHz, setReferenceHz] = usePersistedSetting<number>(
    REFERENCE_HZ_STORAGE_KEY,
    (raw) => {
      const value = Number(raw);
      return Number.isFinite(value) && value >= REFERENCE_HZ_MIN && value <= REFERENCE_HZ_MAX ? value : undefined;
    },
    REFERENCE_HZ_DEFAULT,
  );
  const [temperament, setTemperament] = usePersistedSetting<TemperamentId>(
    TEMPERAMENT_STORAGE_KEY,
    (raw) => (raw && raw in TEMPERAMENT_PROFILES ? (raw as TemperamentId) : undefined),
    "equal",
  );
  const [temperamentKeyPc, setTemperamentKeyPc] = usePersistedSetting<number>(
    TEMPERAMENT_KEY_STORAGE_KEY,
    (raw) => {
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value < 12 ? value : undefined;
    },
    0,
  );
  const [customCents, setCustomCents] = usePersistedSetting<number[]>(
    CUSTOM_TEMPERAMENT_STORAGE_KEY,
    (raw) => loadCustomTemperamentCents(raw),
    CUSTOM_TEMPERAMENT_FALLBACK,
    serializeCustomTemperamentCents,
  );
  const [sensitivity, setSensitivity] = usePersistedSetting<Sensitivity>(
    SENSITIVITY_STORAGE_KEY,
    (raw) => (raw && (SENSITIVITY_ORDER as string[]).includes(raw) ? (raw as Sensitivity) : undefined),
    "medium",
  );
  const [damping, setDamping] = usePersistedSetting<Damping>(
    DAMPING_STORAGE_KEY,
    (raw) => (raw && (DAMPING_ORDER as string[]).includes(raw) ? (raw as Damping) : undefined),
    "normal",
  );
  const [precision, setPrecision] = usePersistedSetting<"standard" | "fine" | "ultra">(
    PRECISION_STORAGE_KEY,
    (raw) => (raw === "standard" || raw === "fine" || raw === "ultra" ? raw : undefined),
    "fine",
  );
  const [historyMode, setHistoryMode] = usePersistedSetting<"line" | "staff">(
    HISTORY_MODE_STORAGE_KEY,
    (raw) => (raw === "line" || raw === "staff" ? raw : undefined),
    "line",
  );
  // Which pitch space the "Key centre" and "Sa is" pickers show/store their
  // pitch class in. tuning.ts's readingFor/targetHzFor always want a
  // *concert* pitch class (temperamentKeyPc keeps storing that, unchanged),
  // but a transposing player thinks in their own written key -- see
  // tuner.md's "Key centre and Sa is ... neither says so" finding.
  const [keyCentreMode, setKeyCentreMode] = usePersistedSetting<"concert" | "written">(
    KEY_CENTRE_MODE_STORAGE_KEY,
    (raw) => (raw === "concert" || raw === "written" ? raw : undefined),
    "concert",
  );
  // Written/concert readout toggle (Calibration): flips the primary note
  // name, the staff and the pitch-history staff mode between the player's
  // written pitch and concert pitch. Independent of keyCentreMode above,
  // which is about which pitch space a *picker* stores its value in, not
  // which one the live readout displays.
  const [displayMode, setDisplayMode] = usePersistedSetting<"written" | "concert">(
    DISPLAY_MODE_STORAGE_KEY,
    (raw) => (raw === "written" || raw === "concert" ? raw : undefined),
    "written",
  );
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const instrument = INSTRUMENTS[instrumentId];
  const tuningOptions = useMemo<TuningOptions>(
    () => ({ referenceHz, temperament, keyPc: temperamentKeyPc, customCents }),
    [referenceHz, temperament, temperamentKeyPc, customCents],
  );
  const tuner = useTuner(instrument, {
    sensitivity,
    damping,
    tuning: tuningOptions,
    historyMode,
    precision,
    displayMode,
  });
  // The dock pill: two seats for the workspace on screen. The last seat per
  // workspace is remembered; the tuner's Written / Concert seats are the
  // existing readout setting, so they are not stored a second time.
  const [storedSeats, setStoredSeats] = usePersistedSetting<Record<string, string>>(
    CONTEXT_SEATS_KEY,
    parseContextSeats,
    EMPTY_SEATS,
    serialiseContextSeats,
  );
  const seatKey = contextKeyFor(mode, instrument);
  const seats = contextSeatsFor(mode, instrument);
  const seatValue = seatKey === "tune:pitch" ? displayMode : resolveContextSeat(seatKey, storedSeats);
  const setSeatValue = useCallback(
    (key: string, value: string) => {
      if (key === "tune:pitch") {
        if (value === "written" || value === "concert") setDisplayMode(value);
        return;
      }
      setStoredSeats((current) => (current[key] === value ? current : { ...current, [key]: value }));
    },
    [setDisplayMode, setStoredSeats],
  );
  // The section the last pill tap already scrolled to, so the effect below
  // (which brings a restored seat into view) does not scroll a second time.
  const revealedRef = useRef<string | null>(null);

  useEffect(() => {
    let shouldOpen = true;
    try {
      shouldOpen = localStorage.getItem(BOCAL_ONBOARDING_KEY) !== "complete";
    } catch {
      shouldOpen = true;
    }
    const timer = window.setTimeout(() => setOnboardingOpen(shouldOpen), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        const next: Theme = saved === "light" || saved === "dark"
          ? saved
          : document.documentElement.dataset.theme === "light"
            ? "light"
            : "dark";
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.documentElement.style.colorScheme = next;
        window.bocalHost?.setTheme?.(next);
      } catch {
        // Dark remains the dependable default if browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(NAVIGATION_SIDE_STORAGE_KEY);
        if (saved === "left" || saved === "right") setRailSide(saved);
      } catch {
        // The navigation remains on the left when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(INSTRUMENT_STORAGE_KEY);
        if (isInstrumentId(saved)) setInstrumentId(saved);
      } catch {
        // Bocal opens on the alto when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Repaints the frozen pitch-history graph the moment the theme changes
  // even while not listening (colours are read straight off the DOM), the
  // same behaviour the old combined loader/paintHistory effect had when
  // `theme` was one of its dependencies.
  useEffect(() => {
    tuner.history.repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    if (!sessionActive) return;
    const timer = window.setInterval(() => setSessionSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive]);

  const toggleSession = () => {
    if (sessionActive) {
      try {
        const existing = JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) ?? "[]");
        existing.unshift({ date: new Date().toISOString(), seconds: sessionSeconds });
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(existing.slice(0, 30)));
      } catch {
        // Device-local history is an enhancement; the session still works without it.
      }
      setSessionSeconds(0);
    }
    setSessionActive((value) => !value);
  };

  const selectMode = useCallback((nextMode: Mode) => {
    if (nextMode !== "tune" && tuner.isBusy()) tuner.stop();
    setMode(nextMode);
  }, [tuner]);

  // The header picker is the only instrument chooser; the dock pill switches
  // the view inside the workspace instead.
  const chooseInstrument = useCallback(
    (nextId: InstrumentId) => {
      if (nextId === instrumentId) {
        setInstrumentPickerOpen(false);
        return;
      }
      if (tuner.isBusy()) tuner.stop();
      setInstrumentId(nextId);
      setInstrumentPickerOpen(false);
      try {
        localStorage.setItem(INSTRUMENT_STORAGE_KEY, nextId);
      } catch {
        // The choice still applies for this visit.
      }
    },
    [instrumentId, tuner],
  );

  const chooseSeat = (seat: Seat) => {
    if (seat.opens) {
      selectMode(seat.opens);
      return;
    }
    setSeatValue(seatKey, seat.id);
    if (seat.section) {
      revealedRef.current = `${seatKey}:${seat.id}`;
      revealSection(seat.section, { focus: true });
    }
  };

  // A scroll seat that was stored for this workspace (a reload, or coming back
  // to it) is brought into view once the workspace is on screen. The left seat
  // is where the page already opens, so it is left alone.
  useEffect(() => {
    const seat = seats.find((candidate) => candidate.id === seatValue);
    if (!seat || !seat.section || seat.id === defaultContextSeat(seatKey)) return;
    const token = `${seatKey}:${seat.id}`;
    if (revealedRef.current === token) {
      revealedRef.current = null;
      return;
    }
    return revealSection(seat.section, { focus: false });
    // `seats` is derived from the same inputs as seatKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatKey, seatValue]);

  const completeOnboarding = () => {
    try { localStorage.setItem(BOCAL_ONBOARDING_KEY, "complete"); } catch { /* The guide can close without storage. */ }
    setOnboardingOpen(false);
  };

  // Keyboard access for pointer/keyboard devices (ChromeOS, laptops,
  // foldables docked to a keyboard). Digits jump straight to a destination;
  // arrows walk the nav. Suppressed while typing so the lesson-note textarea
  // and any future text input keep their keys.
  //
  // Arrow-nav used to fire globally, which stole ArrowLeft/ArrowRight from
  // every radiogroup and tablist inside a workspace (notation switch,
  // sensitivity/damping pickers, the tone generator's tabs) and from the
  // lab's own note browser -- focusing a radio and pressing the ARIA-mandated
  // arrow key changed the whole page instead of the radio (a11y-ux.md
  // finding "Global ArrowLeft/ArrowRight workspace switcher steals arrow
  // keys"). It's now suppressed whenever focus sits inside a role=radiogroup
  // / role=tablist / .note-browser (the lab's note browser lives outside
  // this file, but its own arrow handlers now stopPropagation -- see
  // fingering-fidelity's WP5), and additionally only runs at all in
  // `mode !== "sax"` so the 3D lab and chart labs get their arrow keys back
  // for stepping through notes.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    };
    const isInsideOwnArrowHandler = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return Boolean(el?.closest('[role="radiogroup"], [role="tablist"], .note-browser, .note-scroll'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (keyboardHelpOpen) setKeyboardHelpOpen(false);
        else if (downloadCenterOpen) setDownloadCenterOpen(false);
        else if (instrumentPickerOpen) setInstrumentPickerOpen(false);
        else if (onboardingOpen) setOnboardingOpen(false);
        else return;
        event.preventDefault();
        return;
      }
      if (isTyping(event.target)) return;
      if (instrumentPickerOpen || onboardingOpen || downloadCenterOpen || keyboardHelpOpen) return;

      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= navItems.length) {
        event.preventDefault();
        selectMode(navItems[digit - 1].id);
        return;
      }
      if (event.key === "?" && !isInsideOwnArrowHandler(event.target)) {
        event.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }
      if (mode === "sax") return;
      if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !isInsideOwnArrowHandler(event.target)) {
        const index = navItems.findIndex((item) => item.id === mode);
        if (index < 0) return;
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        selectMode(navItems[(index + step + navItems.length) % navItems.length].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [downloadCenterOpen, instrumentPickerOpen, keyboardHelpOpen, mode, onboardingOpen, selectMode]);

  const chooseRailSide = (side: RailSide) => {
    setRailSide(side);
    try { localStorage.setItem(NAVIGATION_SIDE_STORAGE_KEY, side); } catch { /* The preference still applies for this visit. */ }
  };

  const chooseTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    window.bocalHost?.setTheme?.(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* The preference still applies for this visit. */ }
  };

  const chooseCustomCent = useCallback((degreeIndex: number, value: number) => {
    setCustomCents((current) => {
      const next = current.slice();
      next[degreeIndex] = Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : 0;
      if (degreeIndex === 0) next[0] = 0;
      return next;
    });
  }, [setCustomCents]);

  return (
    <div className={`app-shell nav-${railSide}`}>
      <a className="skip-to-content" href="#bocal-main">Skip to content</a>
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-mark" onClick={() => selectMode("tune")} aria-label="Bocal home">
          <span className="brand-glyph" aria-hidden="true" />
          <span className="brand-logotype" aria-hidden="true" />
        </button>

        <nav className="rail-nav">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`rail-button ${mode === item.id ? "is-active" : ""}`}
                onClick={() => selectMode(item.id)}
                aria-current={mode === item.id ? "page" : undefined}
                aria-keyshortcuts={String(index + 1)}
                title={`${navLabelFor(item.id, instrument)} (${index + 1})`}
              >
                <Icon size={19} />
                <span>{navLabelFor(item.id, instrument)}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
          <div className="privacy-dot"><LockKeyhole size={14} /> Local only</div>
          {/* Was a literal "TU" text glyph -- a leftover initialism that
              meant nothing to a player and didn't match anything else in
              the settings entry points (product.md/a11y-ux.md). A plain
              settings icon, same as the top-bar's overflow button. */}
          <button className="avatar" aria-label="Open Bocal settings" onClick={() => setDownloadCenterOpen(true)}><Settings2 size={17} /></button>
        </div>
      </aside>

      <main className="main-stage" id="bocal-main" tabIndex={-1}>
        <header className="top-bar">
          <div className="instrument-picker-wrap">
            <button className="instrument-picker" aria-label="Choose instrument" aria-expanded={instrumentPickerOpen} onClick={() => setInstrumentPickerOpen((value) => !value)}>
              <span className="instrument-icon">{instrument.id === "guitar" ? <Guitar size={18} /> : instrument.id === "vocal" ? <Mic2 size={18} /> : instrument.labTier === "harmonica" ? <Columns4 size={18} /> : <Wind size={18} />}</span>
              <span><small>Instrument</small>{instrument.shortName} · {instrument.pitchLabel}</span>
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="top-actions">
            <div className={`session-clock ${sessionActive ? "is-running" : ""}`}>
              <Clock3 size={15} /> {formatTime(sessionSeconds)}
            </div>
            <button className="button secondary" onClick={toggleSession}>
              {sessionActive ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {sessionActive ? "End session" : "Start practice"}
            </button>
            <button className="icon-button theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`} aria-pressed={theme === "light"} onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="icon-button" aria-label="Open settings and handoff" aria-expanded={downloadCenterOpen} onClick={() => setDownloadCenterOpen(true)}><MoreHorizontal size={20} /></button>
          </div>
        </header>

        {instrumentPickerOpen && <InstrumentPickerExperience open selectedId={instrumentId} onSelect={chooseInstrument} onClose={() => setInstrumentPickerOpen(false)} />}
        {onboardingOpen && <OnboardingGuide open selectedId={instrumentId} onSelect={chooseInstrument} onComplete={completeOnboarding} />}
        {downloadCenterOpen && <DownloadCenter railSide={railSide} onRailSideChange={chooseRailSide} theme={theme} onThemeChange={chooseTheme} onClose={() => setDownloadCenterOpen(false)} onOpenOnboarding={() => { setDownloadCenterOpen(false); setOnboardingOpen(true); }} onOpenKeyboardHelp={() => { setDownloadCenterOpen(false); setKeyboardHelpOpen(true); }} />}
        {keyboardHelpOpen && <KeyboardHelp onClose={() => setKeyboardHelpOpen(false)} />}

        {mode === "tune" && (
          <TunerView
            reading={tuner.reading}
            listening={tuner.listening}
            trackerReading={tuner.trackerReading}
            pitchTrace={tuner.pitchTrace}
            acceptedFrames={tuner.acceptedFrames}
            level={tuner.level}
            sessionSeconds={sessionSeconds}
            micMessage={tuner.micMessage}
            onListen={tuner.start}
            onReference={() => tuner.playReference()}
            lockedTargetMidi={tuner.lockedTargetMidi}
            onLockTarget={tuner.lockTarget}
            onOpenSax={() => selectMode("sax")}
            instrument={instrument}
            notation={notation}
            saTonic={saTonic}
            onNotationChange={setNotation}
            onSaTonicChange={setSaTonic}
            referenceHz={referenceHz}
            temperament={temperament}
            temperamentKeyPc={temperamentKeyPc}
            onReferenceHzChange={setReferenceHz}
            onTemperamentChange={setTemperament}
            onTemperamentKeyPcChange={setTemperamentKeyPc}
            customCents={customCents}
            onCustomCentChange={chooseCustomCent}
            sensitivity={sensitivity}
            onSensitivityChange={setSensitivity}
            damping={damping}
            onDampingChange={setDamping}
            precision={precision}
            onPrecisionChange={setPrecision}
            historyMode={historyMode}
            onHistoryModeChange={setHistoryMode}
            onClearHistory={tuner.history.clear}
            historyCanvasRef={tuner.history.canvasRef}
            keyCentreMode={keyCentreMode}
            onKeyCentreModeChange={setKeyCentreMode}
            displayMode={displayMode}
            onDisplayModeChange={setDisplayMode}
            onPlayPitchPipe={tuner.startPitchPipe}
            onStopPitchPipe={tuner.stopPitchPipe}
            onOpenKeyboardHelp={() => setKeyboardHelpOpen(true)}
          />
        )}
        {mode === "tune" && <CallAndResponse variant="page" instrumentId={instrumentId} notation={notation} saTonic={saTonic} listening={tuner.listening} onListen={tuner.start} micMessage={tuner.micMessage} graph={tuner.vocalGraph} />}
        {mode === "sax" && (instrumentId === "guitar"
          ? <GuitarStudio reading={tuner.reading ? { hz: tuner.reading.hz, cents: tuner.reading.cents, midi: tuner.reading.concertMidi } : null} listening={tuner.listening} onListen={tuner.start} />
          : instrumentId === "vocal"
            ? (
              <VocalStudio
                onOpenTune={() => selectMode("tune")}
                listening={tuner.listening}
                onListen={tuner.start}
                micMessage={tuner.micMessage}
                graph={tuner.vocalGraph}
                notation={notation}
                saTonic={saTonic}
                precision={precision}
                lockedTargetMidi={tuner.lockedTargetMidi}
                playReference={tuner.playReference}
              />
            )
            : instrument.labTier === "harmonica"
              ? <HarmonicaChart instrument={instrument} notation={notation} tonic={saTonic} onBack={() => selectMode("tune")} reading={tuner.reading ? { midi: tuner.reading.concertMidi, cents: tuner.reading.cents } : null} listening={tuner.listening} onListen={tuner.start} seat={seatValue} onSeatChange={(next) => setSeatValue(seatKey, next)} />
              : <SaxophoneLab onBack={() => selectMode("tune")} instrumentId={instrumentId} notation={notation} saTonic={saTonic} seat={seatValue} onSeatChange={(next) => setSeatValue(seatKey, next)} />)}
        {mode === "pulse" && <PulseView tuningOptions={tuningOptions} />}
        {mode === "analyze" && <AnalysisView instrument={instrument} notation={notation} saTonic={saTonic} mode={seatValue as AnalysisMode} onModeChange={(next) => setSeatValue("analyze", next)} />}
        {mode === "practice" && (
          <PracticeView
            onOpenTuner={() => selectMode("tune")}
            onOpenSax={() => selectMode("sax")}
            onOpenPulse={() => selectMode("pulse")}
          />
        )}
      </main>

<div className="mobile-dock">
        {/* Composition mirrors the curved-keyboard reference: two circular
            side buttons flanking a centered segmented pill (here the real
            instrument switch), floating above an arced bar whose active tab
            is a compact pill hugging its glyph. Inverted for the dark theme:
            the reference's dark-pill-on-light-bar becomes ink-on-dark. */}
        <div className="dock-top">
          {/* Left circle is a privacy BADGE (mirrors the rail's "Local only"
              dot), deliberately styled flat so it doesn't read as a button. */}
          <div className="dock-side-button is-badge" aria-hidden="true"><LockKeyhole size={16} /></div>
          <div className="dock-pill" role="group" aria-label="Workspace view">
            <svg className="pill-track" viewBox={`0 0 ${PILL_VIEWBOX.w} ${PILL_VIEWBOX.h}`} aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="pillFill" x1="0" y1="6" x2="0" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#1a1c23" />
                  <stop offset="1" stopColor="#23262f" />
                </linearGradient>
              </defs>
              {/* Recessed track: dark seam, then a bottom-lit fill, so the
                  groove reads as cut into the dock (Hyle crater logic). */}
              <path d={PILL_PATH} fill="none" stroke="#0a0b0f" strokeWidth="36" strokeLinecap="round" />
              <path d={PILL_PATH} fill="none" stroke="url(#pillFill)" strokeWidth="32" strokeLinecap="round" />
            </svg>
            {seats.map((seat, index) => {
              const place = pillSeat(index, seats.length);
              const pressed = !seat.opens && seatValue === seat.id;
              return (
                <button
                  key={`${seatKey}:${seat.id}`}
                  className={pressed ? "is-active" : ""}
                  aria-pressed={pressed}
                  title={seat.title}
                  style={{ left: place.left, top: place.top, "--tilt": place.tilt } as React.CSSProperties}
                  onClick={() => chooseSeat(seat)}
                >
                  {seat.label}
                </button>
              );
            })}
          </div>
          <button className="dock-side-button" aria-label="Open Bocal settings" onClick={() => setDownloadCenterOpen(true)}>TU</button>
        </div>
        <nav className="mobile-nav is-arc" aria-label="Primary navigation">
          {/* The 4:1 box uses height:0/padding-bottom:25% (NOT the aspect-ratio
              property, which collapsed to zero height on some Android WebView
              renderers and scrambled every percentage seat); .arc-inner is the
              box the SVG and seats position against. */}
          <div className="arc-inner">
            <svg className="arc-shape" viewBox="0 0 400 100" aria-hidden="true" focusable="false">
              {/* Molded-bar shading per the Hyle tactile kit (gunmetal set):
                  no outline ring — the shape is carried by light. A dark seam
                  underlay, a vertical srf gradient fill, a top-lip sheen, and
                  a faint bottom rim-light where the bar catches bounce. */}
              <defs>
                <linearGradient id="arcFill" x1="0" y1="8" x2="0" y2="94" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#282d37" />
                  <stop offset="0.55" stopColor="#1f2129" />
                  <stop offset="1" stopColor="#171922" />
                </linearGradient>
                <linearGradient id="arcSheen" x1="0" y1="10" x2="0" y2="92" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(255,255,255,0.12)" />
                  <stop offset="0.4" stopColor="rgba(255,255,255,0.02)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
                <linearGradient id="arcRim" x1="0" y1="10" x2="0" y2="94" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="rgba(255,255,255,0)" />
                  <stop offset="0.8" stopColor="rgba(255,255,255,0)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0.07)" />
                </linearGradient>
              </defs>
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="#0c0e13" strokeWidth="61" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcFill)" strokeWidth="58" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcSheen)" strokeWidth="56" strokeLinecap="round" />
              <path d="M22 62 Q200 27 378 62" fill="none" stroke="url(#arcRim)" strokeWidth="58" strokeLinecap="round" />
            </svg>
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  className={active ? "is-active" : ""}
                  aria-current={active ? "page" : undefined}
                  aria-label={navLabelFor(item.id, instrument)}
                  aria-keyshortcuts={String(index + 1)}
                  style={{ left: ARC_SEATS[index].left, top: ARC_SEATS[index].top, "--tilt": ARC_TILTS[index] } as React.CSSProperties}
                  onClick={() => selectMode(item.id)}
                >
                  <Icon size={19} />{active && <span>{navLabelFor(item.id, instrument)}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="download-overlay" role="presentation">
      <section className="download-dialog" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title">
        <header>
          <div><p className="eyebrow">Keyboard shortcuts</p><h2 id="keyboard-help-title">Get around without a pointer.</h2></div>
          <button onClick={onClose} aria-label="Close keyboard shortcuts"><X size={19} /></button>
        </header>
        <section className="settings-panel">
          <ul>
            {navItems.map((item, index) => (
              <li key={item.id}><kbd>{index + 1}</kbd> {item.label}</li>
            ))}
            <li><kbd>←</kbd> <kbd>→</kbd> Switch workspace (outside a lab, or a focused list/tab)</li>
            <li><kbd>?</kbd> Open this dialog</li>
            <li><kbd>Esc</kbd> Close a dialog</li>
          </ul>
        </section>
      </section>
    </div>
  );
}
