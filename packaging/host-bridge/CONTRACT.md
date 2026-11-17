# Bocal host-bridge contract, v0 (draft)

Status: draft for owner review. Text and JSON only; nothing here is enforced by a test yet, and no host other than
`android/` exists. Derived by reading `web-source/app/native-bridge.ts`, `use-foreground-pause.ts`, `takes-store.ts`,
`android/.../BocalHost.kt` and `WebAppScreen.kt`, as recorded in `docs/PORTING_PLAN.md` section 2.1. The machine-readable
form is `contract.json` beside this file; if they disagree, fix both.

The web bundle is unchanged on every host. A host is a native shell that loads it and supplies the duties below.

## `window.bocalHost` (optional)

The app tolerates its absence, but a host without `saveFile` is an error state: a blob-anchor download in a native
host is a silent no-op.

| Method | Returns | Rule |
| --- | --- | --- |
| `setTheme(theme)` | void | `"light"` or `"dark"`. Window and system chrome follow the page: `#f7f5ee` light, `#060607` dark. Never throw on other values. |
| `setKeepAwake(on)` | void | Held while tuner, metronome or drone runs. Released on host pause and teardown. |
| `saveFile(name, mime, base64)` | boolean | **Accepted, not written.** `false` if a save is already pending, the decoded payload exceeds 32 MiB (33,554,432 bytes) or the base64 is invalid. `name` is at most 128 characters with no path separators or control characters; `name` and `mime` are sanitised by the host. The result is shown by native UI, never reported to JS. A failed write never deletes the destination. |
| `openExternal(url)` | boolean | `http` or `https` only, non-blank host, no userinfo. Returns once queued; a launch failure surfaces only in native UI. |

Optional read-only properties: `hostName`, `hostVersion` (strings).

### Asynchronous shims

Tauri `invoke`, Capacitor and QWebChannel are asynchronous, while the app calls these methods synchronously and expects
a boolean. A shim therefore:

1. validates and sanitises exactly as above, and applies the 32 MiB bound, before any native call;
2. returns `true` after queueing the request;
3. keeps its own in-flight flag and returns `false` from `saveFile` while a save is pending.

## Event

`bocal:host-pause`, dispatched on `window` when the host leaves the foreground. The host releases keep-awake. Nothing
restarts on resume: the host must not dispatch a resume event and the app never starts audio on return.

## Duties outside `window.bocalHost`

1. **Stable non-`file://` origin**, a secure context for the microphone and IndexedDB that survives updates.
2. **Microphone**: grant audio capture only to the app origin, one request at a time, asking the OS only when the page asks.
3. **File chooser**: `<input type="file">` is used for audio and JSON import; the host must supply the picker.
   Not part of `window.bocalHost`.
4. **Navigation policy**: only the app origin loads; `http(s)` navigation goes to the system browser; no popups;
   renderer death is recovered.
5. **No network capability and no backup** of app data.

## Not covered

Behaviour on any host. Android is the reference and is unmodified; its conformance is by reading, not by test. A
conformance harness (plan item B0.2) does not exist yet.
