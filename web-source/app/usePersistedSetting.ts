"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * A single localStorage-backed setting: React state that loads its saved
 * value asynchronously on mount (a zero-delay timer, matching every other
 * deferred load this app already did before this hook existed -- kept so
 * hydration never sees a value read from storage) and persists every change
 * back to the same key. Read/write failures (private browsing, storage
 * disabled, corrupt JSON) are swallowed; the setting keeps working for the
 * rest of the session, it just doesn't survive a reload.
 *
 * Replaces the repeated "eleven `chooseX` callbacks plus five grouped loader
 * effects" pattern page.tsx used to hand-write for every persisted tuner
 * setting -- one call per setting instead of one bespoke callback and a slice
 * of a shared effect.
 *
 * @param key       The localStorage key.
 * @param parse     Turns the raw stored string (or `null`, when nothing is
 *                   saved yet) into a value, or `undefined` to keep the
 *                   fallback -- this is also where range/shape validation
 *                   belongs, exactly like the inline checks the callers used
 *                   to write by hand (e.g. "is this an integer 0-11?").
 * @param fallback  The value used until the load completes, and whenever
 *                   `parse` returns `undefined`.
 * @param serialize How to turn a value back into a string for storage.
 *                   Defaults to `String(value)`, right for the plain
 *                   string/number settings; callers with a JSON-shaped value
 *                   pass their own (e.g. `JSON.stringify`).
 */
export function usePersistedSetting<T>(
  key: string,
  parse: (raw: string | null) => T | undefined,
  fallback: T,
  serialize: (value: T) => string = (value) => String(value),
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = parse(localStorage.getItem(key));
        if (parsed !== undefined) setValue(parsed);
      } catch {
        // The fallback stays in effect when device storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Only `key` should re-trigger a reload -- `parse`/`fallback`/`serialize`
    // are expected to be stable for the lifetime of one call site, the same
    // assumption the callbacks this replaces made about their own closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
        try {
          localStorage.setItem(key, serialize(resolved));
        } catch {
          // The choice still applies for this session.
        }
        return resolved;
      });
    },
    [key, serialize],
  );

  return [value, set];
}
