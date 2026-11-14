"use client";

import { useEffect, useRef } from "react";

// One shared modal-focus mechanism for every role="dialog" overlay.
//
// While the overlay is mounted it:
//   1. moves focus to the first focusable control inside it (or the heading);
//   2. traps Tab / Shift+Tab inside it;
//   3. marks everything else in the page `inert` (every sibling along the path
//      from the overlay up to <body>, because the overlays are rendered inside
//      <main> and so main itself cannot be inert);
//   4. on unmount restores `inert` and returns focus to the element that was
//      focused when it opened.
// Escape handling stays with each caller.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Shared across simultaneously mounted dialogs: element -> holders, and whether
// it was already inert before we touched it.
const inertHolds = new Map<Element, { count: number; wasInert: boolean }>();

function holdInert(el: Element) {
  const entry = inertHolds.get(el);
  if (entry) {
    entry.count += 1;
    return;
  }
  inertHolds.set(el, { count: 1, wasInert: el.hasAttribute("inert") });
  el.setAttribute("inert", "");
}

function releaseInert(el: Element) {
  const entry = inertHolds.get(el);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count > 0) return;
  inertHolds.delete(el);
  if (!entry.wasInert) el.removeAttribute("inert");
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
}

export function useModalFocus<T extends HTMLElement = HTMLDivElement>(active: boolean = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const inerted: Element[] = [];
    for (let node: Element = root; node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
        holdInert(sibling);
        inerted.push(sibling);
      }
    }

    const first = focusableIn(root)[0];
    if (first) first.focus();
    else {
      const heading = root.querySelector<HTMLElement>("h1, h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableIn(root);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;
      if (!current || !root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? lastItem : firstItem).focus();
      } else if (event.shiftKey && current === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && current === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      for (const el of inerted) releaseInert(el);
      if (opener && opener.isConnected) opener.focus();
      else document.getElementById("bocal-main")?.focus();
    };
  }, [active]);

  return ref;
}
