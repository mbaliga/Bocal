# Bocal — multi-platform porting plan

> Part of the constellation-wide porting program (`Personal-Tracker/PORTING_PROGRAM.md`, 2026-10-06).
> Status: **PLAN — nothing in this document has been built.** Every claim about a target platform is
> labelled with its evidence class (§0). This file is owned by the lead planning session; a platform
> track updates only its own §4 row and appends dated evidence entries to `docs/CURRENT_STATE.md`
> ("Platform targets"), this repo's state file.
>
> Written 2026-10-06 against the checkout at `c710c7d` (merge of PR #19, 2026-09-18). Documentation only: no code, build
> file, workflow or generated artefact was touched. `OQ-n` and `F-n` are the program's owner questions and shared-foundation
> items (program §8, §6); `R1`-`R12` and `I-1`-`I-12` its rules and directives; `S-BOC-*` are spikes introduced here.

## 0. Evidence labels (never dropped)

The program's set: `LAB` · `CI (hosted VM) evidence` · `EMULATOR EVIDENCE` · `SIMULATOR` ·
`CI-APPROX — NOT DEVICE EVIDENCE` · `SIMULATED — NOT DEVICE EVIDENCE` · `VIRTUALIZED — NOT DEVICE EVIDENCE` ·
`SYNTHETIC` · `CI-ONLY / NOT RUN` · `NEEDS-DEVICE-VALIDATION` (NDV) · `NEEDS-OWNER-VALIDATION` (NOV) · `PLAN` ·
`NOT-APPLICABLE (<reason>)` · `CONTAINER-BUILD-ONLY` · `BROWSER-HEADLESS`.

This repo's gates: the Playwright harnesses are `BROWSER-HEADLESS` (Chromium only), the API 26/35 job is
`EMULATOR EVIDENCE`; neither is device evidence (`docs/PRODUCTION_V1_ACCEPTANCE.md`, `qa/VERIFICATION.md`). A port inherits
that: a green build or simulator run establishes no microphone accuracy, latency, musical correctness, signing or store
acceptance on its platform.

## 1. What this repo is, in porting terms

- **Product.** A local-first practice app for woodwind (and guitar) players: a confidence-gated tuner, metronome/pulse with
  gap drills, tone generator with an exercise library, local recording and analysis (spectrogram, A/B overlay, MIDI and
  MusicXML export), practice evidence, and Three.js fingering labs on two licensed models (alto saxophone, Howarth oboe)
  plus 2D charts. Audio stays on the device; nothing is transmitted (`README.md`, `docs/CURRENT_STATE.md`, `privacy-policy.md`).
- **State.** v1.0.0-rc.1 release candidate, Android `versionCode` 8 (`docs/CURRENT_STATE.md`, 18 September 2026). Not an
  accepted or published V1: every device, teacher-review and signing gate in `docs/PRODUCTION_V1_ACCEPTANCE.md` is
  unchecked. No tags; not on Play. Last commit 2026-09-18.
- **Targets today.** (a) The Android WebView shell `android/`. (b) A hosted build (vinext on Cloudflare Workers:
  `web-source/vite.config.ts`, `worker/index.ts`, `.openai/hosting.json`); whether it is live is **unknown**. (c) The
  standalone single-file bundle `web-source/preview-dist/index.html` from `npm run preview:standalone`, never committed:
  what Android packages and what every port should package (`web-source/preview/README.md`).
- **In porting terms.** Here a port is shell work, not code work. The product is
  a web app with a four-method optional host bridge (`window.bocalHost`) and one DOM event (`bocal:host-pause`); `android/`
  is a complete reference host. Each new target is a host supplying the same duties (§2.1) around the same unchanged bundle.
  No port needs a change to `web-source/` to build.
- **Stack.** TypeScript/TSX, React 19.2, Three.js 0.180 (WebGL2, WebGL1 fallback), Tailwind 4; npm + Vite 8, Node >= 22.13.
  Hosted build: vinext 1.0.0-beta.10, Next 16.3.5, wrangler. Standalone build: `vite.preview.config.ts`,
  `vite-plugin-singlefile`, `scripts/inline-preview-assets.mjs`, target `chrome69`, GLBs inlined as base64. Android:
  Kotlin/Compose around one `androidx.webkit` WebView, Gradle 9.7.1, AGP 9.3.0, JDK 21, minSdk 26. **Native dependencies in
  the product: none** (no JNI, WASM, SharedArrayBuffer or AudioWorklet).
- **Size (measured 2026-10-06).** `git ls-files web-source/app | grep -E '\.(ts|tsx)$' | xargs wc -l`: 16,779 lines in 58
  files; with `\.css$`: 4,229 in 11. `git ls-files android | grep -E '\.(kt|java)$' | xargs wc -l`: 1,002 lines in 12 files.
  Tests: 45 files in `web-source/tests`, 337 cases (`grep -rhoE '^\s*(test|it)\(' web-source/tests | wc -l`), plus Android
  JVM and instrumentation tests. The bundle's size is **unmeasured** (nothing was built): the preview README says about
  1.5 MB, but the two GLBs alone are about 3.7 MB before base64; measure `ls -l web-source/preview-dist/index.html`.
- **Owner environment.** Termux to a homelab Dell, no Windows, macOS or Android Studio GUI (`research/Supplied_Music_Learning_App_Baseline.md`
  §0): builds are hosted CI (I-8); device hardware is unconfirmed (OQ-1, OQ-2, OQ-5).

## 2. Portable core vs platform-bound layers

| Module / dir | Role | Portability | Approx LOC | Notes |
|---|---|---|---|---|
| `web-source/app` | The product: tuner, pulse, tone generator, analysis, 3D labs, charts, guitar, practice tools, pure-TS engines, persistence, `native-bridge.ts`, `use-foreground-pause.ts` | web | 16.8k TS, 4.2k CSS | Only Next imports are `next/dynamic` and `next/font/google`, shimmed by `preview/`. Persistence is localStorage and IndexedDB. |
| `web-source/preview` | Standalone entry: `index.html`, `main.tsx`, `dynamic-shim.tsx`, `preview-fonts.css` | web | ~120 | **Source of the portable artefact.** Ports package its output, never the vinext build. |
| Hosted layer | `vite.config.ts`, `worker/index.ts`, `build/sites-vite-plugin.ts`, `next.config.ts`, `.openai/` | other (Cloudflare) | ~200 | Irrelevant to native ports; `npm run build` still exercises it, so it stays in the gate. |
| `web-source/tests` | Unit suites and Playwright harnesses (contrast, e2e, production smoke, reliability, phone-landscape) | web | ~5.5k | Chromium only (`tests/browser.mjs`; fake capture device at `production-smoke.mjs:21`). No WebKit gate. |
| `web-source/scripts` | `inline-preview-assets.mjs`, `check-bundle-syntax.mjs` (Chrome 69 parse check), `sync-handoff.mjs` | web (Node) | ~1.2k | Any CI OS. |
| `web-source/public`, `assets` | Two CC BY 4.0 GLBs, `ATTRIBUTION.md`, seven WebP images | web | n/a | Attribution and modification notices ship in every distribution. |
| `android` | Hardened WebView shell: `WebAppScreen.kt`, `BocalHost.kt`, `BocalFileSaver.kt`, `LocalAssetWebViewClient.java`, `WebViewFloor.kt` | android-bound | 1.0k | The reference host; unchanged. `models/`, `web-source-v6/`, `web-standalone/` are historical and not counted. |
| `scripts` (root) | `verify_android_artifact.py` (ZIP integrity, embedded models, byte-identical payload), `audit-dependencies.mjs` | python, node | small | The payload-identity check is the pattern to generalise (B0.3). |

### 2.1 What a host must do (read from the Android reference)

From `native-bridge.ts`, `use-foreground-pause.ts`, `takes-store.ts` (`saveOrShareFile`), `BocalHost.kt`,
`BocalFileSaver.kt` and `WebAppScreen.kt`. This is the seed of the shared contract (B0.1).

1. **Stable non-`file://` origin.** Android serves `https://appassets.androidplatform.net`: a secure context for the
   microphone and IndexedDB that survives updates (`android/README.md`).
2. **Microphone.** Grant audio capture only to the trusted origin, one request at a time, asking the OS only when the page
   asks (no prompt before deliberate listening). `WebAppScreen.kt:159`.
3. **`setTheme`** (light or dark): window and system-bar chrome follow the page; palette `#f7f5ee` / `#060607`.
4. **`setKeepAwake(on)`**: held while tuner, metronome or drone runs; released on pause and teardown.
5. **`saveFile(name, mime, base64)` returns a boolean meaning "accepted", not "written".** `false` if a save is pending,
   the payload exceeds 32 MiB, or the base64 is invalid. Name (<= 128 characters, no path or control characters) and MIME
   are sanitised. The result is reported by native UI, never to JS, and a failed write never deletes the destination. A
   blob-anchor download in a native host is a silent no-op, so a host without `saveFile` is an error state (`takes-store.ts:147-165`).
6. **`openExternal(url)`**: `http(s)` only, non-blank host, no userinfo; returns once queued.
7. **`bocal:host-pause`**: dispatched on leaving the foreground; keep-awake released; nothing restarts on resume.
8. **Navigation policy**: only the app origin loads, `http(s)` navigation goes to the system browser, no popups, renderer
   death is recovered (`LocalAssetWebViewClient.java`).
9. **File chooser.** Audio and JSON import use `<input type="file">` (`AnalysisView.tsx:545`, `ToneGenerator.tsx:864`,
   `TranscribePanel.tsx:172`); Android supplies the picker in `onShowFileChooser`. This duty is **not** in `window.bocalHost`
   and was not in the profile that fed this plan.
10. **No network, no backup** (no `INTERNET`, `android:allowBackup="false"`), and an **engine floor**: `WebViewFloor.kt` blocks
    WebViews below Chrome 69 with a native screen.

### Platform-bound APIs that matter

| API | Where | Porting impact |
|---|---|---|
| `getUserMedia` with `autoGainControl`, `echoCancellation`, `noiseSuppression` off | `useTuner.ts:387`, `AnalysisView.tsx:357` | Needs a secure context and host permission plumbing. Engines may ignore the raw-audio constraints, which matter for tuner accuracy. Behaviour in QtWebEngine on Lomiri, WebKitGTK, WKWebView and WebView2 via wry is **unknown** until the spikes. |
| Web Audio (`AudioContext` + `AnalyserNode` on `requestAnimationFrame`); `MediaRecorder` (`audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`); `decodeAudioData` | `useTuner.ts`, `AnalysisView.tsx:391-416`, `audio-scheduler.ts`, `transcribe.ts:97` | Portable by specification (ASSUMPTION until B0.5); latency and audio-session behaviour are device gates already. WebKit is expected to yield `audio/mp4` (ASSUMPTION) and `extensionForMime()` handles `m4a`; WebKitGTK `MediaRecorder` **unknown**. |
| IndexedDB (takes) and localStorage (the rest) | `takes-store.ts`, `idb-transaction.ts`, `usePersistedSetting.ts`, `storage-keys.ts` | Expected everywhere (ASSUMPTION; `NEEDS-DEVICE-VALIDATION` per engine); origin and eviction are host-defined. Each shell needs a stable origin that does not change with install path or version. |
| `window.bocalHost`, `bocal:host-pause` | `native-bridge.ts`, `use-foreground-pause.ts`, `PracticeTools.tsx:256`, `useTuner.ts:362,424`, `PulseView.tsx:470-486`, `page.tsx:289,462` | The whole bridge (§2.1). App calls are synchronous and boolean; Tauri, Capacitor and QWebChannel are asynchronous, so each shim returns "accepted" after queueing and keeps its own in-flight flag. |
| `navigator.canShare` / `share` with files | `PracticeTools.tsx:266`, `TranscribePanel.tsx:130` | `TranscribePanel` swallows `share()` rejection, so a WebView where `canShare` is true but `share` fails makes that export a silent no-op. Per-engine behaviour **unknown**. |
| `<a download>` to `/downloads/BOCAL_HANDOFF.md`; "Android" wording in user-facing errors | `DownloadCenter.tsx:40,101,110`, `takes-store.ts:152-153` | The link targets a hosted file the standalone bundle does not contain (behaviour in any native host, Android included, **unverified**). The wording shows verbatim on every host and is pinned by `storage-commit.test.mjs:85,93` and `release-downloads.test.mjs:22` (B0.6). |
| WebGL2 via Three.js; GLBs as base64 `data:` URIs | `ImportedInstrumentCanvas.tsx:346-359` | Expected to work on WKWebView and WebView2 (ASSUMPTION until B0.5 and S-BOC-WIN1). WebKitGTK may need `WEBKIT_DISABLE_DMABUF_RENDERER=1`; QtWebEngine on Halium GLES **unverified**. No asset serving is needed. |
| Absent APIs (and `navigator.vibrate`, a guarded no-op off Android) | `web-source/public`, `app/` | No service worker, manifest, File System Access, SharedArrayBuffer/COOP-COEP, WebGPU, Web Speech or WebMIDI: no host needs special headers, and a PWA is not yet possible. |

## 3. Binding rules this port must not break

- **Nothing leaves the device.** No accounts, ads, analytics or tracking; Android declares no `INTERNET`. No port adds a
  network allowlist, update checker or crash-reporting SDK (`docs/store/privacy-policy.md`, `play-console.md`; I-1). Local
  data is excluded from Android Auto Backup; each port decides the equivalent explicitly (Q9).
- **Microphone only on deliberate listening**, with an in-app rationale first; recording only on Record; takes leave only
  through an explicit save flow (`privacy-policy.md`, `PRODUCTION_V1_ACCEPTANCE.md`).
- **No blob-download fallback in a native host.** Each host implements `saveFile` with a real picker; acceptance means the
  picker opened, not that the write completed (`takes-store.ts`, `android/README.md`).
- **The packaged app is byte-identical to the tested standalone bundle**, which is generated and never edited or committed
  (`README.md`, `.gitignore`, `scripts/verify_android_artifact.py`, `android/app/build.gradle.kts`).
- **Environment honesty.** A green build or emulator run proves none of microphone accuracy, latency, musical correctness,
  signing or store acceptance, and the acceptance checklist must not be turned into a statement that testing happened
  (`PRODUCTION_V1_ACCEPTANCE.md`, `qa/VERIFICATION.md`; I-4).
- **Only `web-source/` is the product**; `web-source-v6/`, `web-standalone/` and `models/glb/` are not build entry points
  (`README.md`, `BOCAL_HANDOFF.md` §12). The `chrome69` target and `MIN_WEBVIEW_MAJOR` move together
  (`scripts/check-bundle-syntax.mjs`).
- **Two licensed models only, CC BY 4.0.** Attribution and the CC BY §3(a)(1)(B) modification notices in
  `web-source/public/models/ATTRIBUTION.md` ship in every distribution; no NonCommercial asset may be bundled
  (`android/THIRD_PARTY_NOTICES.md`, `play-console.md`). Store and marketing copy matches shipped behaviour: sax proxies,
  the oboe-based cor anglais and chart-only instruments stay distinguished, with no TonalEnergy-superiority or
  expert-certification claim (`PRODUCTION_V1_ACCEPTANCE.md`).
- **Hyle is a namespaced CSS adaptation only**; its name and marks are not Bocal branding. The page palette
  (`#f7f5ee` / `#060607`, mirrored in `BocalHost.kt`) is the visual contract for any shell's window chrome
  (`web-source/THIRD_PARTY_NOTICES.md`).
- **Signing material is never committed**; it arrives only as environment secrets and a debug certificate is rejected for
  any candidate (`release.yml`, `android/README.md`). New npm, cargo and SwiftPM dependencies meet the zero-finding standard
  of `scripts/audit-dependencies.mjs --enforce` by convention. Store metadata follows `Personal-Tracker/store/HOUSE_DEFAULTS.md`
  (`play-console.md`), which is **not present** in the local Personal-Tracker checkout on 2026-10-06; its content is unknown here.
- **`docs/BOCAL_HANDOFF.md` and `web-source/public/downloads/BOCAL_HANDOFF.md` stay identical** (`sync-handoff.mjs`,
  `tests/release-downloads.test.mjs`). This plan does not edit the handoff, though its §11 is where open decisions would
  otherwise go; a later PR that runs the sync can mirror §8 there.
- **Colour never carries meaning alone.** The supplied brief records a red-green constraint
  (`research/Supplied_Music_Learning_App_Baseline.md` §0); whether I-3 binds Bocal is OQ-26. Any UI a shell owns uses words
  and shape.

## 4. Target matrix (owner's order)

| Target | Feasibility | Approach | Blockers | Effort (eng-weeks, estimate) | Evidence today |
|---|---|---|---|---|---|
| Ubuntu Touch | moderate | Click via Clickable 8.10 (24.04-1.x framework). A QML host embeds `WebEngineView` and loads the standalone bundle from a stable secure origin, injects `window.bocalHost`, and implements it in QML plus a small C++ main. Common policy groups only. | Microphone grant in QtWebEngine on Lomiri unknown (S-BOC-UT1). WebGL on Halium GLES unknown. Whether Chromium's sandbox runs under click confinement unknown. No UT device on record (OQ-1). Click id and OpenStore identity absent (OQ-25). | 4 | PLAN |
| Linux desktop | straight | Tauri 2 host in `desktop/` (webkit2gtk-4.1) serving the bundle from the app origin; bridge as an injected script over `invoke`; Flatpak primary, AppImage and deb secondary; no network capability. | WebKitGTK `getUserMedia` grant and raw-audio constraints unknown (S-BOC-LX1). WebGL/DMA-BUF quirks unknown. No WebKit gate (B0.5). Electron fallback barred by R8 unless OQ-15 says otherwise. Licence for Flathub (OQ-12). | 3 | PLAN |
| iOS / iPadOS | moderate | Capacitor 8 project in `apple/capacitor/` (WKWebView on `capacitor://localhost`), a local Swift plugin and a document-start script providing `window.bocalHost`. iPad first. Unsigned simulator build on `macos-latest`. | No Developer Program, bundle id or Mac on record (OQ-2, OQ-5, OQ-25). Audio-session, interruption and storage-eviction behaviour unknown (S-BOC-IOS1). A 32 MiB base64 export across the bridge is unmeasured. TestFlight crash-report egress needs disclosure. | 5 | PLAN |
| macOS | straight | The same Tauri host on WKWebView: audio-input entitlement, hardened runtime, DMG; ad-hoc signed in CI, notarisation a disabled template. "Designed for iPad" is the no-code alternative once iOS exists. | Apple account and notarisation secrets (OQ-2, OQ-3). No Mac on record, so device gates are NOV (OQ-5). wry's microphone prompt on WKWebView unknown (S-BOC-MAC1). | 2 | PLAN |
| Windows | straight | The same Tauri host on WebView2: NSIS and MSI from tauri-bundler, optional MSIX; save dialog, keep-awake and opener limited to the bridge duties. | Signing route (OQ-3; Azure Artifact Signing is unavailable to the owner; SignPath presumably needs an open-source licence the repo lacks). WebView2 microphone handling in wry unknown (S-BOC-WIN1). WebView2 install mode (Q10). No Windows machine except possibly the Dell (OQ-5). | 2 | PLAN |

Effort is engineer-weeks, an estimate, for one engineer who knows the stack, excluding owner hardware lead time, store
review waits and account set-up. The rows total 16 weeks, matching program §5; the optional PWA step (W0, about 0.5) and the
proposed web-source changes (B0.6) are **outside** them. macOS and Windows are increments over the Linux host.

**Alternatives considered, not proposed.** Tauri 2 on iOS would give one shell for four targets, but program §4.6 and R8
choose Capacitor 8 where plugin work is planned (the bridge plugin is that work); if its dependency tree proves noisy under the
zero-finding audit rule, a hand-written WKWebView host is the fallback. Electron is barred by R8 unless OQ-15 says yes after a
failed WebKitGTK spike. A Morph PWA bookmark on Ubuntu Touch needs a live hosted site and the `networking` group and loses the
save, pause and keep-awake duties. Waydroid running the APK is not a port (OQ-21).

## 5. Tier and sequencing

**Tier B (port in sequence).** Bocal is an actively developed product at release-candidate quality whose web layer is one
self-contained file with a four-method optional bridge, and the Android shell proves the pattern. Every target is shell,
bridge, microphone permission, a real save picker and packaging, not a rewrite, which keeps it out of tier A; it is more than
thin packaging because each engine must be verified for raw-audio `getUserMedia`, `MediaRecorder`, IndexedDB and WebGL, and
the acceptance rules require device audio evidence. Program gate (§5 row): OQ-2 for Apple, and the `com.bocal.music` versus
A System of Cells namespace question (OQ-25).

| Platform | Program wave | Build-entry (CI or simulator) | Device-entry (owner) | Repo-local gate before it starts |
|---|---|---|---|---|
| Ubuntu Touch | P-UT a, parallel with P-LX (a QML `WebEngineView` host rather than a webapp-container click, because the container gives no save picker or pause event, per the profile) | F7's click scaffold and workflow template, or a Bocal click lane in the same shape; B0.1-B0.3 | A UT device (OQ-1) or an explicit CI-only waiver | OQ-25 answered or the placeholder guard in force; OQ-15 only if a loopback origin is chosen |
| Linux desktop | P-LX, in the "Tauri trio" after Animalcules (F10 Tauri lane pilot) and Runout (its SAB spike) | B0.1-B0.5; F10's Tauri lane once OQ-24 is ruled, otherwise Bocal's own | `DEVICE_CHECKLIST_LINUX.md` on the Steam Deck in Desktop Mode; the Dell only if OQ-5 says Linux; Redmagic-Edge not promised | None beyond the program gate; Bocal is not Kotlin, so F1 and F5 do not apply |
| iOS / iPadOS | P-iOS, the "Bocal/Runout (Capacitor 8)" slot after Clavis, nooz/csapp, hnm, Typewright, Foto-Xplorr and Crocodyl Phase 18 | `macos-latest` lanes; Capacitor scaffold; B0.5 | Developer Program and the route OQ-2 picks; the iPad Pro M4 on record; no iPhone on record, so iPhone items are NDV | OQ-2; OQ-25 |
| macOS | P-mac | P-LX Tauri binaries; Developer ID and notarisation secrets (OQ-3) | No Mac on record: gates NOV until OQ-5 changes | Owner confirms macOS is in scope (Q10) |
| Windows | P-win | P-LX Tauri binaries; a signing route (OQ-3) or accepted unsigned | The Dell while it is Windows (OQ-5), afterwards `CI (hosted VM)` only | Owner confirms Windows is in scope (Q10) |

Bocal's docs and configs name none of these platforms (the profile grepped every `.md` and config file), so under program
§7 (macOS and Windows lanes only where scope already includes them) those two wait for an owner scope decision. Bocal is
public, so multi-OS and macOS runners are free (OQ-20 concerns private repos). Whether ports wait for the Android V1 gates
is Q5; the default here is to scaffold in parallel and hold every release, listing and announcement.

## 6. Work breakdown

**Layout (R1-R4).** New directories only (the owner-gated proposals B0.6 and W0 are the only items that would touch `web-source/`, each as its own PR). Nothing existing is edited: not `web-source/`, `android/`, `scripts/`, the four
existing workflows, the root `.gitignore` (each new directory carries its own) or `docs/BOCAL_HANDOFF.md`; the existing gate
(R2) stays green. New paths: `packaging/host-bridge/` (B0.1, B0.2: `CONTRACT.md`, `contract.json`, a test-only conformance
page and a Playwright harness with its own `package.json` and lockfile pinning Playwright 1.56.1, so `web-source`'s lockfile
is untouched); `packaging/verify_payload.py` and tests (B0.3); `packaging/webkit-gate/` (B0.5); `desktop/` (LX-1: Tauri 2
crate, init script, capabilities, icons, `THIRD_PARTY_NOTICES.md`); `packaging/linux/`, `packaging/macos/` and
`packaging/windows/` (Flatpak and AppStream; entitlements, Info.plist and a disabled notarise template; NSIS/WiX/MSIX and
winget templates); `apple/capacitor/` (IOS-1: Capacitor 8 project, local Swift plugin, privacy manifest); `ubuntu-touch/`
(UT-1: `clickable.yaml`, `manifest.json.in`, AppArmor profile, QML, C++ main); and new workflow files only:
`host-bridge-conformance.yml`, `webkit-gate.yml`, `ubuntu-touch.yml`, `desktop-linux.yml`, `desktop-macos.yml`,
`desktop-windows.yml`, `ios.yml`.

**Guard rails on every lane (R3, R5, R6, R11).** SHA-pinned actions; a banner `UNSIGNED — not for release`; package lanes on
`main` and tags only, pull-request lanes compile and test only; no listener, no signing, no Actions artifact upload (storage is
exhausted, and `web-quality.yml` uploads its bundle, so port lanes do not call it). Each lane builds the bundle itself with
`npm ci` and `npm run preview:standalone` in `web-source/`, stages it into a gitignored directory and never edits it. Release
binaries go to draft GitHub Releases. **Identifiers:** no click name, Flatpak id, bundle id, MSI GUID or winget id is
registered until a `NAMES.md` row exists (Personal-Tracker's has no Bocal row). Scaffolds that cannot omit one (Tauri
`identifier`, Capacitor `appId`, click `name`) carry an obviously invalid placeholder, and B0.3's guard fails any package or
sign lane while it is present. That is this plan's reading of R11, for the owner to confirm.

### Step 0: shared, pure-core-first (R4). About 1.0 week costed under Linux, 0.5 under iOS

- **B0.1 Host-bridge contract v0 (0.25 w).** `CONTRACT.md` and `contract.json` from §2.1, adding the asynchronous-shim rule:
  return `true` after queueing, keep an in-flight flag, apply the same sanitisation and 32 MiB bound before native code, and
  optional read-only `hostName`/`hostVersion`. **This is the F10 `window.<app>Host` item this repo pilots**; it is lifted
  into Shared-Libraries-asoc by the OQ-24 mechanism, never copy-vendored (I-6). Done when the owner reviews it. Text only.
- **B0.2 Conformance harness (0.4 w).** A test-only page exercising the four methods with edge arguments (bad theme,
  oversized or invalid base64, userinfo URL, two concurrent saves), the pause event, navigation probes, the file chooser and
  an IndexedDB marker that must survive relaunch. A Playwright test loads the real bundle in Chromium with a mock host and
  asserts what the *app* does: one `saveFile` call with a sanitised name and base64 decoding to the file's bytes, and
  microphone tracks stopped after `bocal:host-pause`. Lane `host-bridge-conformance.yml`; `BROWSER-HEADLESS`; never
  packaged. Android is unmodified, so its conformance is by reading, not by test.
- **B0.3 Payload verifier and placeholder guard (0.25 w).** `verify_payload.py` extracts `app.html` from each artefact
  (`.ipa`, `.click`, `.msix`, `.exe`/`.msi`, `.app`/`.dmg`, `.AppImage`/Flatpak bundle), asserts byte equality with the bundle
  built in the same job, imports (not copies) `verify_html()` from `scripts/verify_android_artifact.py`, asserts no
  conformance page is inside, and fails on the placeholder id. Synthetic-ZIP unit tests are stdlib-only and should run in the
  build container. Not an F-item in the program; offered to F9/F10.
- **B0.4 Reproducibility spike (0.1 w).** Build the bundle twice in one job and once on another OS and compare SHA-256:
  **unknown today**. Until known, identity is checked within a job (passing it between jobs needs the exhausted artifact storage).
- **B0.5 WebKit gate (0.5 w, costed under iOS).** `webkit-gate.yml` runs Playwright's WebKit project against the bundle
  served from a loopback static server inside the job: contrast and layout, an e2e smoke, IndexedDB persistence, a WebGL
  context with the real GLBs, `MediaRecorder` MIME probing, a `canShare`/`share` probe. New harnesses live in
  `packaging/webkit-gate/` because the existing ones call `launchChromium`. Playwright WebKit is not WKWebView or WebKitGTK,
  and the Chromium fake-capture flags have no known WebKit equivalent, so capture stays NDV.
- **B0.6 Proposed `web-source` changes (PROPOSAL; each a normal PR, owner-gated; none needed to build; about 0.25 w each).**
  (a) Host-neutral wording in `takes-store.ts:152-153` and `DownloadCenter.tsx:110` with the tests that pin it; required before
  any non-Android release, because copy must match shipped behaviour. (b) A `BOCAL_BROWSER` switch in `tests/browser.mjs` so the
  existing harnesses can run under WebKit. (c) Verify, then hide or inline, the `/downloads/BOCAL_HANDOFF.md` anchor in native
  hosts. (d) A `navigator.canShare` policy once the spikes report.
- **W0 Hosted-site PWA (PROPOSAL; optional, about 0.5 w, outside §5; a normal owner-gated PR like B0.6; only if Q4 says the hosted build is maintained).** R8 says web apps
  go PWA first. A manifest and cache-first service worker belong to the hosted build only (`web-source/public/`,
  `app/layout.tsx`); `preview/main.tsx` mounts the page without `layout.tsx`, so the Android payload is unchanged. Consumes
  F12. A worker in the standalone bundle is **not** proposed: it would break byte identity with Android.

### Ubuntu Touch (4 w)

- **UT-1 Scaffold and lane (1.0 w).** `ubuntu-touch/` with `clickable.yaml` (framework `ubuntu-touch-24.04-1.x`, arm64,
  digest-pinned `clickable/ci-ut24.04-1.x-arm64`), `manifest.json.in` with an `@UT_NAME@` placeholder, an AppArmor profile, a
  QML page and a C++ main. Lane `ubuntu-touch.yml` on `ubuntu-latest` plus an arm64 smoke on `ubuntu-24.04-arm`. The program
  assumes (UA02, unverified) that a 24.04-1.x click installs on 24.04-2.x. Done when the click builds in CI
  (`CI (hosted VM) evidence`); the build container cannot build one.
- **UT-2 Host (1.5 w).** Origin: preferably a custom secure scheme registered in C++ before the application object exists
  (`QWebEngineUrlScheme` plus a handler serving the one file), so the origin does not depend on the versioned
  `/opt/click.ubuntu.com/...` path and takes survive an upgrade; the only alternative is a loopback static server (`127.0.0.1` only; OQ-15);
  `file://` is excluded by duty 1 (not a secure context, origin tied to the install path). Bridge: a document-start user script plus QWebChannel. Microphone:
  grant audio capture for the trusted origin from the permission-request signal. Import: `fileDialogRequested` to Content Hub
  import. Export: `saveFile` writes app-private storage and offers it through Content Hub export. Keep-awake: the
  `keep-display-on` group grants only Unity.Screen `keepDisplayOn`/`removeDisplayOnRequest`; the call path is unverified.
  Pause: dispatch `bocal:host-pause` when `Qt.application.state` leaves active. Lomiri SIGSTOPs unfocused apps about 1.5 s
  after the suspend request, so the event is best effort, nothing runs in the background, the last recording chunk may be
  lost (NDV), and handoff §11's "keep the click running" question is moot on this host.
- **UT-3 Policy, review and payload (0.5 w).** Candidate groups `audio`, `microphone`, `webview`, `content_exchange`,
  `keep-display-on`; `networking` is never added by this plan: if S-BOC-UT1 shows QtWebEngine cannot run confined without it, the track stops with `BLOCKED(networking group)` and the owner rules (fold into Q1 / OQ-15), because §3's no-network rule and I-1 forbid a unilateral grant. All sit in the program's
  automated-review set. F7's policy checker and `verify_payload.py` run on the `.click`. Done when both pass in CI.
- **UT-4 Device session (1.0 w; owner-gated by OQ-1).** `DEVICE_CHECKLIST_UT.md` plus Bocal's rows: microphone grant and
  denial, a real instrument on the tuner, WebGL labs, suspend and resume, Content Hub export and import, upgrade preserving
  takes. Evidence stays `NEEDS-DEVICE-VALIDATION`.
- **S-BOC-UT1 (inside UT-1/UT-2).** Decides: microphone grant through `WebEngineView`; WebGL under Halium GLES; whether the
  Chromium sandbox runs confined or `QTWEBENGINE_DISABLE_SANDBOX` is needed (a weakening the owner should see; tolerable only
  because the page loads nothing remote); file-dialog interception; origin stability across upgrades. A desktop-Qt run under
  `offscreen` on `ubuntu-24.04-arm`, if QtWebEngine 5.15 installs there, gives engine evidence labelled
  `CI-APPROX — NOT DEVICE EVIDENCE`. Which Chromium a custom QML click gets (the brief says 87 for webapp-container apps on
  24.04-1.x) is **unverified**; either is above the Chrome 69 floor.

### Linux desktop (3 w)

- **B0.1-B0.4 (1.0 w).** As above.
- **LX-1 Tauri host (0.75 w).** `desktop/`: a Tauri 2 crate whose `frontendDist` is a staged directory holding only the bundle (no dev
  server, no listener). An initialization script defines `window.bocalHost` over `invoke`. Rust commands only: `save_file` (portal save
  dialog; writes exactly the path the user chose), `set_keep_awake` (D-Bus `org.freedesktop.ScreenSaver` inhibit),
  `open_external` (`http(s)`, Android's URL rules), `set_theme`; no `fs`, `http` or `shell` plugin. Pause on window blur and
  minimise. CSP denies every remote origin; the exact directives are a spike output because `GLTFLoader` fetches `data:` URIs
  and the bundle inlines its script. Reuse of Animalcules' `desktop/` waits on OQ-24: no copy-vendoring.
- **LX-2 Spike S-BOC-LX1 (0.25 w).** On WebKitGTK via wry: does `getUserMedia` prompt and grant, are the raw-audio constraints
  honoured, does `MediaRecorder` exist and with which MIME, WebGL with and without `WEBKIT_DISABLE_DMABUF_RENDERER`, `canShare`.
  If media-stream fails: an owner ruling on Electron (OQ-15) or a Chromium `--app` window over the standalone file as an interim.
- **LX-3 Packaging (0.75 w).** `packaging/linux/`: a Flatpak manifest with `--socket=pulseaudio`, a display socket and
  `--device=dri`, **no** `--share=network`, no `--filesystem`; AppStream metadata (id and licence pending OQ-4, OQ-12; CC BY
  credits in the description); the runtime current at submission. Flathub builds offline, so the manifest consumes the verified
  `index.html` from a draft GitHub Release by SHA-256 plus vendored cargo sources (byte identity applied to Flathub). AppImage
  (built on `ubuntu-22.04` for glibc) and `.deb` are secondary; the program lists AppImage for Bocal, the repo's docs do not
  (OQ-4). x86_64 first, arm64 on `ubuntu-22.04-arm`. Lane `desktop-linux.yml`. Done when the package builds and verifies in CI.
- **LX-4 Device session (0.25 w).** Steam Deck in Desktop Mode: microphone, WebGL labs, resize, save portal. Redmagic-Edge
  under Termux:X11 is **not promised** (the same phone runs the Android build natively). Evidence `NEEDS-DEVICE-VALIDATION`.

### iOS and iPadOS (5 w)

- **IOS-1 Capacitor project and simulator lane (1.0 w).** `apple/capacitor/` with Capacitor 8 (Xcode 26, iOS 15 minimum,
  SwiftPM default, per the program's iOS brief), `webDir` a staged directory holding only the bundle as `index.html`, `appId` placeholder. Lane `ios.yml` on
  `macos-latest`: unsigned simulator build (`CODE_SIGNING_ALLOWED=NO`), no `.ipa`, no upload. Evidence `SIMULATOR` and
  `CI (hosted VM) evidence`.
- **IOS-2 Plugin and shim (1.25 w).** A local Swift plugin and a `WKUserScript` added from a `CAPBridgeViewController`
  subclass, so the HTML stays untouched. `saveFile` writes a temporary file and presents `UIDocumentPickerViewController`;
  `setKeepAwake` sets `isIdleTimerDisabled`; `setTheme` sets status-bar style and background; `openExternal` applies Android's
  URL rules; app-state notifications dispatch `bocal:host-pause`. A 32 MiB base64 message through the WKWebView bridge is
  unmeasured; if it fails on a device, a chunked `saveFile` is an additive contract proposal, not a unilateral change.
- **B0.5 WebKit gate (0.5 w).** As above.
- **IOS-3 Audio session and microphone (0.75 w; spike S-BOC-IOS1).** `NSMicrophoneUsageDescription` reusing the privacy
  policy's rationale; confirm capture under `capacitor://localhost`; choose the `AVAudioSession` category and mode
  (`playAndRecord`, with or without measurement mode); check the ringer switch does not mute metronome and tone output;
  interruption and route changes. No `UIBackgroundModes`, so the app stops on background like Android; keeping the click alive
  would need a background-audio mode (Q8).
- **IOS-4 Privacy and disabled templates (0.5 w).** `PrivacyInfo.xcprivacy` (no tracking, no collected data, plus the
  required-reason entries F10's Apple lints call for); App Store text drafts; signing and TestFlight jobs as disabled
  templates. TestFlight uploads tester crash reports to the developer automatically, an OS-level egress the privacy copy must
  disclose and the owner must accept (OQ-2). Done when the lints pass in CI.
- **IOS-5 Device session (1.0 w; owner-gated by OQ-2).** The iPad Pro M4: the physical gates of `PRODUCTION_V1_ACCEPTANCE.md`
  restated for iPadOS (permission, routes, interruption, lock, rotation, storage pressure, upgrade preserving takes); iPhone
  items stay NDV. Evidence `NEEDS-DEVICE-VALIDATION`.

### macOS (2 w)

- **MAC-1 Host configuration (0.75 w).** `packaging/macos/`: `com.apple.security.device.audio-input`,
  `NSMicrophoneUsageDescription`, hardened runtime, DMG; save panel via the Rust `save_file`; keep-awake via an IOKit power
  assertion; appearance follows `setTheme`. macOS 15 floor, Apple silicon primary (program §4.4). The Mac App Store route
  additionally needs the App Sandbox and a user-selected read-write entitlement; an owner choice (OQ-4).
- **MAC-2 Lane and notarisation template (0.75 w).** `desktop-macos.yml` on `macos-latest`: build, ad-hoc sign,
  `verify_payload.py`; the notarise job is a disabled template until OQ-3, and secrets never enter the repo.
- **MAC-3 Verification (0.5 w; spike S-BOC-MAC1).** WebKit-gate results plus whether wry prompts for the microphone on
  WKWebView and honours the entitlement. Takes are `audio/mp4`, covered by `extensionForMime`. Evidence
  `CI (hosted VM) evidence` and `NEEDS-OWNER-VALIDATION`. **Alternative:** the iPad build as "Designed for iPad" on
  Apple-silicon Macs after IOS-5: no code, but it needs the App Store route and the same Apple account.

### Windows (2 w)

- **WIN-1 Host configuration (0.75 w).** `packaging/windows/`: NSIS and MSI from tauri-bundler, an MSIX template, a disabled
  winget template. Microphone: WebView2's default prompt may suffice; whether wry changes that is **unknown** (S-BOC-WIN1).
  Keep-awake via `SetThreadExecutionState`; save via the Rust `save_file`; title-bar theme follows `setTheme`.
- **WIN-2 Lane and signing templates (0.75 w).** `desktop-windows.yml` on `windows-2025`; the R3 path lint runs first. A
  pre-check on 2026-10-06 found no tracked path with a forbidden character, reserved device name, trailing dot or space, or case
  collision (`git ls-files` with `grep`/`awk`; not the program's lint tool). There is no `.gitattributes`; a `-text` rule for
  binaries would be belt and braces (a root change, not made). Signing jobs are disabled templates until OQ-3.
- **WIN-3 Verification (0.5 w; spike S-BOC-WIN1).** WebView2 is Chromium, so the Chromium harnesses approximate it
  (`BROWSER-HEADLESS`); WebView2 install mode and a real-machine microphone check remain `NEEDS-OWNER-VALIDATION`.

## 7. Shared foundation this repo consumes or provides

| Item | Relation | Detail |
|---|---|---|
| F10 `window.<app>Host` contract | **Provides (pilot)** | B0.1 and B0.2: the contract, conformance harness and asynchronous-shim rule, for Runout, Animalcules and any later web host. Bocal's three host implementations are the first non-Android ones. |
| F10 packaging templates | Consumes | Flatpak manifest consuming a prebuilt artefact, WiX/NSIS and winget, macOS entitlements, Info.plist and notarise script, Apple lints and `PrivacyInfo.xcprivacy`, the Tauri `tauri.conf.json` and lane (piloted in Animalcules). Bocal needs no COOP/COEP headers. Until OQ-24 rules a mechanism, Bocal writes its own and reconciles later. |
| F7 ubuntu-touch-shell | Consumes in part | Click scaffold and workflow template, policy checker, OpenStore account, `DEVICE_CHECKLIST_UT.md`. F7's webapp template is a webapp-container; Bocal needs a QML `WebEngineView` host, which F7 does not list, and offers it back as a second template after S-BOC-UT1. Bocal has no JVM core, so program spike S-UT1 does not gate it. |
| F9 CI matrix | Conventions only | SHA pinning, no artifact uploads, package lanes on `main`/tags only, the R3 path lint, the `ut-click` and `ut-arm64-smoke` lanes. KMP lanes do not apply; Tauri and Capacitor lanes are Bocal's own files. |
| F11 evidence and checklists | Consumes and provides | The device-checklist templates; Bocal supplies its rows (microphone, WebGL, save picker, upgrade preserving takes). |
| F12 web/brand kit | Consumes | PWA manifest and maskable icons for W0; icon sets for `.icns`, `.ico`, Flatpak and click. A roster entry for Bocal's platforms needs owner confirmation. |
| F1-F6, F8 | Not consumed | Not a Kotlin port, holds no keys (OQ-22 does not bind it), embeds no native engine, uses Hyle only as a CSS adaptation; its web error boundary is its own. |

**Others' needs from Bocal.** Runout and Animalcules reuse the contract, and Runout the recorded Capacitor and WebKitGTK spike
results (its SAB and AudioWorklet questions are separate). The payload verifier (B0.3) is offered to F9/F10.

## 8. Open questions for the owner

Each says what is blocked. Q10 (scope, WebView2), Q11 and Q12 were raised while writing this plan; the rest are the repo
profile's, de-duplicated.

| # | Question | Blocks | Program ref |
|---|---|---|---|
| Q1 | Do you own an Ubuntu Touch device, and which 24.04-2.x release? (The program excludes 20.04.) | S-BOC-UT1 and every UT device gate; otherwise UT stays `CI (hosted VM)`/`CI-APPROX` | OQ-1 |
| Q2 | Will you have an Apple Developer Program membership and a Mac, and how does a build reach the iPad (TestFlight with its crash-report egress, ad-hoc OTA, sideload)? | iOS and macOS device gates, TestFlight, notarisation; builds stay CI-only | OQ-2, OQ-5 |
| Q3 | Desktop engine: Tauri 2 as planned, Electron if WebKitGTK media-stream fails, or the hosted PWA as the first desktop deliverable? | LX-2's fallback; W0 | R8, OQ-15 |
| Q4 | Is the hosted vinext/Cloudflare build still maintained (is `asystemofcells.com/bocal` live)? If not, that layer can be retired. | W0; simplifying a gate that still runs `npm run build` | none (Bocal-local) |
| Q5 | Should ports wait for the Android V1 acceptance gates (device audio, teacher review, signing identity) or proceed in parallel? | Any release, listing or announcement; default is scaffold in parallel, hold releases | none (Bocal-local) |
| Q6 | What code licence applies to `web-source/`? None is declared; only historical `web-standalone/` (MIT) and `models/LICENSE-ASSETS.md` exist. Flathub, OpenStore and F-Droid, and presumably SignPath Foundation signing, need one. **Proposed:** add Bocal to OQ-12. | LX-3 metadata, store submissions, one Windows signing route | OQ-12 (extend) |
| Q7 | Canonical identifier for non-Android stores: keep `com.bocal.music` or move to an A System of Cells namespace? Data directories (click, Flatpak, and by our reading Tauri's WebView storage) are expected to be keyed by it, so a post-release change could strand users' takes. | Every manifest; any release | OQ-25 |
| Q8 | Handoff §11: on host pause, should the metronome click keep running while the microphone stops? iOS would need a background-audio mode; Ubuntu Touch freezes everything regardless; desktop could keep it on focus loss. | IOS-2, IOS-3, LX-1 pause semantics | none (Bocal-local) |
| Q9 | Should takes and practice history be excluded from iCloud, OneDrive and Snap backups as Android does, or is backup acceptable? Whether WKWebView storage can be excluded is unknown. | IOS-3; privacy copy | none (Bocal-local) |
| Q10 | Which listings do you want (OpenStore, Flathub, App Store, Mac App Store, Microsoft Store, GitHub releases only); are macOS and Windows in Bocal's scope at all; and which Windows route and WebView2 install mode (bootstrapper, offline installer, fixed runtime)? | MAC and WIN lanes; identity, metadata and review work per store | OQ-3, OQ-4 |
| Q11 | Desktop UI shape: accept the shared mobile-first UI and arc navigation unchanged in a desktop window (`docs/CURRENT_STATE.md` keeps it shared, no redesign), or commission desktop layouts? Does I-3 (colour never alone) bind Bocal? | LX-1 window defaults; NOV visual sign-off | OQ-26 |
| Q12 | Where should the bridge contract live once it exists (Shared-Libraries-asoc `packaging/` by generator, or by submodule), given non-Gradle artefacts have no ruled sharing mechanism? | Lifting B0.1/B0.2 out of this repo | OQ-24 |

## 9. Sources read

In this repo (profile of 2026-10-06; §2.1 and the cited lines were re-read directly while writing):

- Docs: `README.md`, `.gitignore`, `docs/CURRENT_STATE.md`, `docs/PRODUCTION_V1_ACCEPTANCE.md`, `docs/BOCAL_HANDOFF.md` (§5, §6,
  §9-§12), `docs/store/privacy-policy.md`, `docs/store/play-console.md`, `qa/VERIFICATION.md`,
  `research/Supplied_Music_Learning_App_Baseline.md`; headers of the older `docs/Bocal_*Handoff*` and `PRODUCT_STATE` files.
- CI: `.github/workflows/web-quality.yml`, `android-debug-apk.yml`, `release.yml`, `cleanup-artifacts.yml`; `.github/dependabot.yml`.
- Web build (under `web-source/`): `README.md`, `package.json`, `vite.config.ts`, `vite.preview.config.ts`, `tsconfig.json`,
  `next.config.ts`, `THIRD_PARTY_NOTICES.md`, `.openai/hosting.json`, `worker/index.ts`, `build/sites-vite-plugin.ts`,
  `preview/README.md`, `preview/index.html`, `preview/main.tsx`, `scripts/inline-preview-assets.mjs`, `public/models/ATTRIBUTION.md`.
- Web app and tests (under `web-source/`): `app/native-bridge.ts`, `use-foreground-pause.ts`, `RuntimeSafety.tsx`, `layout.tsx`,
  `takes-store.ts`, `PracticeTools.tsx`, `TranscribePanel.tsx`, `DownloadCenter.tsx`, `useTuner.ts`, `AnalysisView.tsx`,
  `ToneGenerator.tsx`, `ImportedInstrumentCanvas.tsx` (all in `app/`); `tests/browser.mjs`, `production-smoke.mjs`,
  `storage-commit.test.mjs`, `release-downloads.test.mjs`.
- Android: `android/README.md`, `THIRD_PARTY_NOTICES.md`, `build.gradle.kts`, `settings.gradle.kts`, `app/build.gradle.kts`,
  `app/src/main/AndroidManifest.xml`, and `BocalHost.kt`, `BocalFileSaver.kt`, `WebAppScreen.kt` under
  `app/src/main/java/com/bocal/music/ui/`; `scripts/verify_android_artifact.py`.
- Read for exclusion only: `models/README.md`, `models/LICENSE-ASSETS.md`, `web-source-v6/README.md`, `web-standalone/README.md`,
  `web-standalone/LICENSE-CODE.md`.
- Outside this repo: `Personal-Tracker/PORTING_PROGRAM.md` (§0-§3, §4.1-§4.6, the §5 row, §6-§8), the briefs in
  `Personal-Tracker/porting/platforms/`, and `Personal-Tracker/NAMES.md` and `CONSTELLATION.md` (neither has a Bocal row).
