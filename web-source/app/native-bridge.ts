/** Optional Android bridge. saveFile returns acceptance, not disk-write completion.
 * The native system picker reports completion/cancellation after the user's choice.
 * openExternal likewise returns before the intent is launched: it validates the
 * URL synchronously and returns true once that request is queued, but the actual
 * activity launch happens later on the UI thread. A launch failure there (e.g. no
 * browser available) surfaces only as a native Toast, never back to this return
 * value or a JS callback.
 * publishWidgetSnapshot and takeOpenRequest serve the Android home-screen
 * widgets; widget-snapshot.ts is their only caller.
 */
export {};
declare global {
  interface Window {
    bocalHost?: {
      setTheme?(theme: "light" | "dark"): void;
      setKeepAwake?(on: boolean): void;
      saveFile?(name: string, mime: string, base64: string): boolean;
      openExternal?(url: string): boolean;
      /** Hands the home-screen widgets a practice summary (see widget-snapshot.ts). False when the shell rejected it. */
      publishWidgetSnapshot?(json: string): boolean;
      /** The workspace a home-screen widget asked to open, handed over once; "" when there is none. */
      takeOpenRequest?(): string;
    };
  }
}
