# Host-bridge conformance harness

Test-only. Never packaged (`packaging/verify_payload.py` rejects a payload containing a conformance page). Label:
`BROWSER-HEADLESS` (Chromium only; no WebView, Tauri, Capacitor or QtWebEngine runs here).

It loads the real standalone bundle (`web-source/preview-dist/index.html`) in Chromium with a mock `window.bocalHost` and
checks it against `../contract.json`. It edits neither the app nor the contract. If they disagree it prints `FAIL` and exits
non-zero; record the disagreement in the PR instead of changing either side.

```
cd web-source && npm ci && npm run preview:standalone
cd ../packaging/host-bridge/conformance && npm ci
BOCAL_CHROMIUM=/usr/bin/google-chrome node run.mjs   # or `npx playwright install chromium` and omit the variable
```

Playwright is pinned to 1.56.1 here, in its own lockfile, so `web-source/package-lock.json` is untouched.

## What each case proves

| Case | Drives the app? | Proves |
| --- | --- | --- |
| saveFile one call | yes | Download makes exactly one `saveFile` call; the name passes the host sanitiser (no separators or control characters, at most 128 characters, `.wav` kept); the base64 decodes to the imported file's bytes. |
| saveFile concurrent | yes | A second save while one is pending gets `false` and the app shows "Export could not start"; a save after the first finishes is accepted. |
| saveFile limits | mock only | The mock refuses over-32 MiB and invalid base64, as the contract says. |
| setTheme | yes (app), mock (bad values) | The app only ever sends `light` or `dark`, and the last value matches the page theme; the mock does not throw on others. |
| openExternal | mock only | Userinfo, non-http(s) and blank-host URLs are rejected. The app does not call `openExternal` today, so this checks the mock's rules, not the app. |
| host-pause | yes | After `bocal:host-pause`, every microphone track has ended, keep-awake is released and the app does not restart capture. |

The mock is a reference implementation of the host's duties (sanitising, the in-flight flag, the size bound, URL rules).
Cases marked "mock only" show the contract is implementable and self-consistent; they say nothing about a real host.

## Not yet covered (from plan item B0.2)

Navigation probes, the file chooser, and an IndexedDB marker surviving relaunch need a real host to be meaningful and are not
attempted here.
