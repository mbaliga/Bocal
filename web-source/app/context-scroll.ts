"use client";
import { useEffect, useRef } from "react";

/**
 * Scrolls a workspace section into view and, for a deliberate choice, moves
 * focus to its heading so a keyboard or screen-reader user lands where the
 * page did. Lab views load lazily, so on a restore the section may not exist
 * yet: it is looked for on each frame for about two seconds, then given up.
 * Returns a function that cancels the wait.
 */
export function revealSection(id: string, options: { focus: boolean }): () => void {
  let frame = 0;
  let cancelled = false;
  let tries = 0;
  const attempt = () => {
    if (cancelled) return;
    const section = document.getElementById(id);
    if (!section) {
      tries += 1;
      if (tries < 120) frame = window.requestAnimationFrame(attempt);
      return;
    }
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    if (!options.focus) return;
    const heading = section.matches("h1, h2, h3") ? section : section.querySelector<HTMLElement>("h1, h2, h3");
    const target = heading ?? section;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  attempt();
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}

/**
 * Keeps a view that owns its own state in step with a seat the dock pill
 * chose. `seat` is the value the pill holds (undefined when the view is used
 * without a pill); `current` is what the view is showing now. A new `seat`
 * is applied through `apply` only when it differs from `current`; a change
 * the view makes by itself (its own buttons) is reported through `report`.
 * Nothing is reported on mount, so a stored seat is not overwritten by the
 * view's default before it has loaded.
 */
export function useSeatSync<T>(seat: T | undefined, current: T, apply: (next: T) => void, report?: (next: T) => void) {
  const currentRef = useRef(current);
  const applyRef = useRef(apply);
  const reportRef = useRef(report);
  const lastReported = useRef(current);
  useEffect(() => {
    currentRef.current = current;
    applyRef.current = apply;
    reportRef.current = report;
  });
  useEffect(() => {
    if (seat !== undefined && seat !== currentRef.current) applyRef.current(seat);
  }, [seat]);
  useEffect(() => {
    if (lastReported.current === current) return;
    lastReported.current = current;
    reportRef.current?.(current);
  }, [current]);
}
