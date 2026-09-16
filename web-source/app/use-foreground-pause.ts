"use client";
import { useEffect, useRef } from "react";

/** One-way pause notification. Returning to foreground never starts audio.
 * Pulse may keep playing in a hidden browser tab, but never after host pause
 * or page dismissal. The Android shell explicitly dispatches host-pause.
 */
export function useForegroundPause(onPause: () => void, pauseWhenHidden = true): void {
  const callback = useRef(onPause);
  useEffect(() => { callback.current = onPause; }, [onPause]);
  useEffect(() => {
    const pause = () => callback.current();
    const visibility = () => { if (document.hidden && pauseWhenHidden) pause(); };
    window.addEventListener("bocal:host-pause", pause);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("bocal:host-pause", pause);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pauseWhenHidden]);
}
