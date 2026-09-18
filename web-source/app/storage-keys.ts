// Every localStorage key Bocal writes, in one place.
//
// Before this module existed each key was a string literal (or a bespoke
// local constant) repeated wherever it was read or written -- page.tsx alone
// carried fourteen of them, PulseView and PracticeTools a handful more, and
// AnalysisView kept its own private copy of the three tuning keys just to
// read them back (tuner.md: "page.tsx is a 1619-line god component"). A typo
// in one of two copies of the same string silently loses a player's saved
// setting instead of failing to compile. `tests/storage-keys.test.mjs`
// enforces this: every `localStorage` call under `app/` has to resolve back
// to one of the constants exported here.
//
// JSON-shaped values carry a `-v1` suffix and a sanitiser on read, per the
// wave-2 plan's "Storage" convention; the plain string/number settings below
// don't need either -- they're already primitives, and every reader already
// validates range/shape on load (see page.tsx's `usePersistedSetting` calls).

export const NAVIGATION_SIDE_STORAGE_KEY = "bocal-navigation-side";
export const INSTRUMENT_STORAGE_KEY = "bocal-instrument";
export const PARTNER_INSTRUMENT_STORAGE_KEY = "bocal-instrument-partner";
export const NOTATION_STORAGE_KEY = "bocal-notation";
export const TONIC_STORAGE_KEY = "bocal-sa-tonic";
export const REFERENCE_HZ_STORAGE_KEY = "bocal-reference-hz";
export const TEMPERAMENT_STORAGE_KEY = "bocal-temperament";
export const TEMPERAMENT_KEY_STORAGE_KEY = "bocal-temperament-key";
export const CUSTOM_TEMPERAMENT_STORAGE_KEY = "bocal-temperament-custom";
export const THEME_STORAGE_KEY = "bocal-theme";
export const SENSITIVITY_STORAGE_KEY = "bocal-tuner-sensitivity";
export const DAMPING_STORAGE_KEY = "bocal-tuner-damping";
export const HISTORY_MODE_STORAGE_KEY = "bocal-tuner-history-mode";
export const PRECISION_STORAGE_KEY = "bocal-tuner-precision";
export const KEY_CENTRE_MODE_STORAGE_KEY = "bocal-temperament-key-mode";
export const SESSIONS_STORAGE_KEY = "bocal-sessions";
export const WEEKLY_GOAL_STORAGE_KEY = "bocal-weekly-goal-minutes";
export const LESSON_NOTE_STORAGE_KEY = "bocal-lesson-note";
export const METRONOME_PRESETS_STORAGE_KEY = "bocal-metronome-presets-v1";
export const METRONOME_SEQUENCES_STORAGE_KEY = "bocal-metronome-sequences-v1";

/**
 * The three calibration keys AnalysisView reads (read-only -- it mirrors the
 * live tuner's calibration to score a take against the same reference pitch
 * and temperament the player was actually tuning to, but never writes them).
 * Kept as a namespaced object because that's how AnalysisView already
 * consumed them before this module existed; the values are the same
 * constants above, not a second copy.
 */
export const TUNING_KEYS = {
  referenceHz: REFERENCE_HZ_STORAGE_KEY,
  temperament: TEMPERAMENT_STORAGE_KEY,
  keyPc: TEMPERAMENT_KEY_STORAGE_KEY,
} as const;
