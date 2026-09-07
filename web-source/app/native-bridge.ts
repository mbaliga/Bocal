/**
 * The Android shell (android/.../BocalHost) exposes a small object on
 * `window.bocalHost`. In a plain browser it is absent, so every method is
 * optional and callers must use `window.bocalHost?.method?.(...)`.
 * This is the single declaration; do not redeclare it elsewhere.
 */
export {};

declare global {
  interface Window {
    bocalHost?: {
      setTheme?(theme: "light" | "dark"): void;
      setKeepAwake?(on: boolean): void;
      saveFile?(name: string, mime: string, base64: string): boolean;
      openExternal?(url: string): boolean;
    };
  }
}
