/** Optional Android bridge. saveFile returns acceptance, not disk-write completion.
 * The native system picker reports completion/cancellation after the user's choice.
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
