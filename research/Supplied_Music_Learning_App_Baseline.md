# Baseline for Music — Build Brief + Strategic Analysis (Backendless Edition)

## TL;DR
- **Build it fully on-device.** The backendless constraint is not a limitation for this product — it is a first-class marketing differentiator ("zero INTERNET permission, nothing leaves your phone") that fits the Play Store Data Safety model perfectly, and none of the MVP features need a server.
- **Audio stack recommendation:** Oboe/AAudio for capture at 2-burst buffers, a clean-room DSP YIN/MPM tuner for the free real-time layer, and SwiftF0 (MIT, 95,842 params, ~42× faster than CREPE) via ONNX Runtime as the accuracy engine — but keep GPL-licensed TarsosDSP/pYIN out of any shipped code so it can't poison the closed Baseline engine.
- **Strategic verdict: mostly right, partly delulu.** Wire up exactly three synergies (Hyle tokens, the haptics IR as the tuner's feedback channel, and Baseline as a shared longitudinal core); leave Urbana as a clean seam; treat "Crocodyl multi-sport + music unified engine" as a real thesis only at the data-contract level, not as a shipped product.

---

# DELIVERABLE 1 — `BOCAL_BUILD_BRIEF.md`

> Paste-ready build brief for Claude Code. Working name used throughout is **Bocal** (see Naming section for rationale and alternates). Replace the string `Bocal` project-wide when the name is finalized.

## 0. Context & Hard Constraints

- **Platform:** Native Android, Kotlin + Jetpack Compose. Min SDK 26 (Android 8.0, required for AAudio via Oboe); target SDK 35/36. AGSL shader surfaces gated to API 33+ with token-driven fallbacks.
- **Dev environment:** Claude Code over SSH (Termux on phone → homelab Dell server). No Windows/macOS, no Android Studio GUI in the loop. Build via Gradle CLI; tests must run headless (JVM first). Emulator/device testing via `adb` over network.
- **Target device:** RedMagic 11 Pro (Snapdragon 8 Gen 2, 24 GB RAM) as the reference/high-end; must degrade gracefully to mid-range (4–6 GB RAM, older SoCs).
- **BACKENDLESS — hard rule:** No cloud, no server, no accounts, no network calls. **No `android.permission.INTERNET` in the manifest for MVP.** All data local. Recording OFF by default.
- **Colorblind constraint (hard, non-negotiable, and a market differentiator):** Madhav is red-green colorblind (deuteranopia-class). NEVER encode state with green/red. Use luminance + violet/cyan hue + shape/icon redundancy.

## 1. Repository & Module Architecture

Single Gradle multi-module repo under GitHub org `asystemofcells`. "Liftable seams": every `:core:*` module hides its implementation behind an interface so it can be extracted into a standalone library later.

```
bocal/
├── settings.gradle.kts
├── build-logic/                      # convention plugins (shared Kotlin/Compose/test config)
├── app/                              # thin composition root; wires DI + navigation
│
├── core/
│   ├── audio/        (:core:audio)   # OPEN (Apache-2.0). Oboe/AAudio capture, ring buffer, framing
│   ├── pitch/        (:core:pitch)   # OPEN (Apache-2.0). PitchDetector interface + DSP impls
│   ├── pitch-neural/ (:core:pitch-neural) # OPEN (Apache-2.0). SwiftF0/ONNX impl behind same interface
│   ├── timbre/       (:core:timbre)  # OPEN (Apache-2.0). Spectral centroid, harmonics, tristimulus
│   ├── baseline/     (:core:baseline)# CLOSED (proprietary). Longitudinal trend engine (shared w/ archery)
│   ├── haptics/      (:core:haptics) # OPEN (Apache-2.0). Haptics IR → VibrationEffect renderer
│   ├── hyle/         (:core:hyle)    # OPEN (Apache-2.0). Design tokens, shaders, motion, colorblind palette
│   ├── data/         (:core:data)    # OPEN (Apache-2.0). Room, DAOs, session-bundle JSON export/import
│   └── model/        (:core:model)   # OPEN. Pure Kotlin domain models (no Android deps)
│
├── feature/
│   ├── tuner/        (:feature:tuner)      # OPEN. Real-time note viz + accuracy
│   ├── journal/      (:feature:journal)    # partly CLOSED (Pro trends UI)
│   ├── equipment/    (:feature:equipment)  # OPEN. Instrument/reed/mouthpiece logs
│   ├── repertoire/   (:feature:repertoire) # v2. CLOSED. Audio-to-score scoring
│   ├── posture/      (:feature:posture)    # v3. OPEN. MediaPipe pose
│   └── coach-exchange/(:feature:coach-exchange) # v3. OPEN. File-based bundle exchange
│
└── test-fixtures/    (:test-fixtures)      # synthetic sine/saw WAV generators, golden recordings
```

### Open vs Closed split (matches the established pattern: free/open single-session tools, closed/paid longitudinal Pro)
- **OPEN (Apache-2.0):** everything that is a single-session analyzer or shared infrastructure — `:core:audio`, `:core:pitch`, `:core:pitch-neural`, `:core:timbre`, `:core:haptics`, `:core:hyle`, `:core:data`, `:feature:tuner`, `:feature:equipment`, `:feature:posture`, `:feature:coach-exchange`.
- **CLOSED (proprietary, paid "Pro"):** `:core:baseline` (the longitudinal/trend engine) and the Pro-only trend surfaces inside `:feature:journal` and all of `:feature:repertoire`.
- **Licensing landmine — READ THIS:** TarsosDSP is **GPLv3** (its Maven POM declares "GNU GENERAL PUBLIC LICENSE 3.0") and the reference **pYIN** Vamp implementation is **GPL**. If you link either into the app, the whole app (including the closed Baseline engine) becomes GPL-encumbered. **Do not use TarsosDSP or GPL pYIN in shipped code.** Either (a) write clean-room YIN/MPM in `:core:pitch` from the published papers (YIN: de Cheveigné & Kawahara 2002; MPM: McLeod & Wyvill "A Smarter Way To Find Pitch"), or (b) rely on SwiftF0 (MIT) in `:core:pitch-neural`. Both routes keep the open modules Apache-2.0 and the closed modules proprietary.

## 2. Audio Stack (2025–2026 recommendation)

### 2.1 Capture — Oboe over AAudio
Use **Oboe** (Google's C++ wrapper; calls AAudio on API 27+, OpenSL ES fallback below that). Rationale: Oboe ships device-specific QuirksManager workarounds and sensible defaults, and can be updated far faster than the platform release cycle. Note Oboe does **no DSP** — it is purely I/O routing; all analysis is yours.

Configuration for a low-latency input stream:
- `PerformanceMode::LowLatency`
- `SharingMode::Exclusive` (request MMAP EXCLUSIVE; may be denied — handle gracefully)
- Sample rate: use the device's **native** rate (query it; commonly 48000 Hz) to avoid resampler latency
- Format: `Float`
- **Buffer size = 2 × framesPerBurst** (Oboe's double-buffering default; AAudio's own default is much higher). Monitor `getXRunCount()` and grow the buffer by one burst on underruns.
- Use the **data callback** path, not blocking reads (blocking writes on non-MMAP devices can be much higher latency). Do no allocation, locking, or file I/O in the callback.

### 2.2 Latency budget for the tuner
- Ideal glass-to-glass target for "feels instant" visual tuner feedback: **<20 ms** of app-controllable latency. On a Snapdragon 8 Gen 2 with MMAP EXCLUSIVE and 2-burst buffers you can realistically hit a single-digit-ms audio callback interval; the remaining budget is analysis + Compose frame time.
- Practical framing: analysis hop ~10 ms (480 samples @ 48 kHz), analysis window 2048–4096 samples. Pitch update rate ≥ 50 Hz. Keep the DSP off the Oboe callback thread — push frames into a lock-free ring buffer, analyze on a dedicated high-priority worker, publish results to Compose via `StateFlow`.
- Reality check: hardware input latency varies wildly across mid-range devices and Bluetooth mics add tens of ms; ship an OboeTester-style self-calibration and never assume MMAP is granted.

### 2.3 Pitch detection — tiered behind one interface
`interface PitchDetector { fun analyze(frame: FloatArray, sampleRate: Int): PitchEstimate }` where `PitchEstimate(hz, confidence, isVoiced)`.

| Engine | Type | Notes | License | Role |
|---|---|---|---|---|
| **Clean-room YIN / FFT-YIN** | DSP autocorrelation | ~1 ms/frame class; cheap; good on clean sustained wind tone; FastYin (FFT difference function) is ~3× faster | Your code (Apache-2.0) | **MVP free tuner** default |
| **MPM (McLeod)** | DSP normalized autocorr | Robust octave decisions on winds | Your code (Apache-2.0) | Selectable alt |
| **SwiftF0** | Neural CNN (ONNX) | 95,842 params; ~42× faster than CREPE on CPU (132.6 ms vs 5508.3 ms for a 5 s clip); MIT | MIT | **Accuracy engine** (Pro-grade, noisy rooms) |
| **pYIN (clean-room, HMM+Viterbi)** | DSP + HMM | Best offline stability for post-hoc scoring; do NOT use GPL Vamp build | Reimplement or avoid | v2 offline analysis |

Recommendation: ship the **clean-room DSP YIN/MPM** as the always-on free real-time tuner (tiny, no model load, deterministic), and offer **SwiftF0 via ONNX Runtime** as the higher-accuracy/noise-robust engine. Per the SwiftF0 paper (Nieradzik, arXiv:2508.18440), it "achieves a 91.80% harmonic mean (HM) at 10 dB SNR, outperforming baselines like CREPE by over 12 percentage points and degrading by only 2.3 points from clean audio," while requiring "only 95,842 parameters and [running] approximately 42x faster than CREPE on CPU" (CREPE has 22M params). SwiftF0's preprocessing "reduces the frequency range to 46.875–2093.75 Hz by discarding all but bins 3 to 134" (G1–C7); this comfortably covers concert-pitched saxophone fundamentals but **will clip extreme altissimo/high overtones above ~2093 Hz — flag this and fall back to DSP YIN for the top register.**

**On-device acceleration:** ONNX Runtime Mobile supports CPU, XNNPACK, and NNAPI execution providers on Android; a 96k-parameter model runs comfortably on CPU/XNNPACK, so NPU acceleration is a nice-to-have, not a requirement. Keep the model in `assets/`, create the session once, reuse it.

### 2.4 Timbre / tone-quality analysis (feasible today; saxophone tone development)
`:core:timbre` computes, per analysis window:
- **Spectral centroid** ("brightness"; the single best-established perceptual correlate of timbre — a "brighter" tone has a higher centroid) — track its mean and stability over a held note.
- **Harmonic amplitudes** via FFT peak-picking at integer multiples of detected f0; derive **tristimulus** (T1 = fundamental energy, T2 = harmonics 2–4, T3 = upper harmonics) and **odd/even harmonic ratio** (the saxophone characteristically sits highest on even/odd harmonic ratio among sustained wind/string instruments in the timbre literature).
- **Spectral flux / centroid variance** as a "steadiness of tone" metric.
This is all standard, cheap DSP — very feasible on-device. Frame it to the learner as "tone brightness" and "tone steadiness" trends, not raw physics. This is a genuine differentiator vs. tuner-only competitors.

## 3. Data Layer

- **Room/SQLite** for all structured data (sessions, notes-per-attempt, lesson log, equipment, wishlist, streaks). Room now officially supports Kotlin Multiplatform, so this layer could be lifted cross-platform later without a rewrite.
- **Local files** for opt-in recordings (app-private storage; scoped storage; never MediaStore-public by default).
- **Session bundles** = versioned JSON (`schemaVersion` field) + optional embedded/attached audio, packaged as a `.bocalbundle` (zip). Designed from day one to be the interchange format for the eventual file-based coach exchange.
- **No network permission in MVP** — flag the Play Store advantage explicitly below.

### Play Store privacy advantage (act on this)
Per Google Play's Data Safety rules, "Developers do not need to disclose data accessed by an app as 'collected' ... [if] an app accesses the data only on your device and it is not sent off your device." A backendless app with **no INTERNET permission** can therefore truthfully declare **"No data collected"** and **"No data shared"** in the Data Safety form. This is a real, checkable trust signal: a Yale Privacy Lab / Exodus Privacy study found "more than 75 percent of the 300+ apps analyzed by Exodus contain the signatures of trackers" — an app that holds no network permission *cannot* phone home, which is a differentiator you can market. Put this front-and-center in the store listing and onboarding. (You still need a privacy policy to complete the form; write a one-paragraph "everything stays on your device" policy.)

## 4. Feature Phasing (under the backendless constraint)

### MVP (v1) — the free, open, single-session core
1. **Real-time note visualization + pitch accuracy** — colorblind-safe (luminance + violet/cyan + shape/icon; NEVER green/red). In-tune ≠ green; use a centered, high-luminance violet ring + a checkmark/"lock" glyph; sharp/flat encoded by shape/position + cyan-vs-violet, not hue-only.
2. **Track wishlist** — pieces the learner wants to work on.
3. **Practice sessions** with streaks + improvement-over-time metrics: note hold time, pitch accuracy per note, intonation tendency maps (per-note sharp/flat bias).
4. **Lesson log.**
5. **Equipment log** — instrument/reeds/mouthpiece with lifespan tracking (reed rotation, days-in-service, "retire" prompts).
6. **Practice reminders** via **local** notifications (no server; `AlarmManager`/`WorkManager`).

### v2 — the paid, closed longitudinal layer
7. **Repertoire scoring** — offline audio-to-score alignment. Use **CQT features + DTW**: the literature shows a "CQT-based approach consistently and significantly outperforms a commonly used FFT-based approach in extracting audio features for score following." Use an online/OLTW variant for live following, offline DTW for post-hoc scoring. Handling errors/repeats/skips is a known-hard problem (HMM-based approaches exist) — scope MVP scoring to linear passages first.
8. **Baseline longitudinal engine integration** — trend detection across sessions (this is the paid `:core:baseline`).
9. **Opt-in per-attempt recording** with aggregate analysis (still local-only).

### v3 — richer, still backendless
10. **Camera posture/technique analysis** — MediaPipe **Pose Landmarker** (BlazePose GHUM, 33 3D landmarks, Lite/Full/Heavy models, CPU/GPU delegate, LIVE_STREAM mode, on-device, min SDK 24). Analyze embouchure-adjacent posture: head/neck angle, shoulder symmetry, hand-position stability. All frames processed on-device, nothing stored unless opted in.
11. **File-based coach exchange** — student exports a `.bocalbundle` (session + annotations + optional audio), shares via ANY channel (Android share sheet, QR for small bundles, email, Nearby); teacher's app instance imports, annotates, exports the annotated bundle back. No accounts, no server, asynchronous. Design the annotation model now (comments anchored to timestamp + note index).

## 5. Design System — Hyle

- **Palette:** violet `#8E7BFF`, cyan `#08FED5`, AMOLED black `#000000` surfaces. These two accents are **deuteranopia-safe** (both sit in the blue/cyan region that red-green colorblind users distinguish well, and they differ strongly in luminance) — this is precisely why the app can use them as its primary state encoders. Add the Wong colorblind-safe palette (blue #0072B2, orange #E69F00, vermillion #D55E00, reddish-purple #CC79A7, bluish-green #009E73) as the categorical data-viz ramp for charts, never a red/green ramp.
- **Redundant encoding rule (enforced in `:core:hyle`):** every stateful color MUST ship with a paired shape/icon token and a luminance-distinct value — "avoid red-green pairings as the only means of conveying information ... supplement color with text labels, patterns, or icons." Provide a `StateEncoding(hue, shape, icon, luminanceTier)` token type so no surface can encode state by hue alone.
- **Light model:** upper-left key light (consistent shadow/highlight direction across components).
- **Motion:** ~300 ms cubic-bezier standard transition token.
- **Shaders:** AGSL via `RuntimeShader` for accent surfaces (tuner glow, gradient meters). **AGSL/`RuntimeShader` requires API 33+ (Android 13)**; provide a token-driven fallback (static gradient/`Brush`) for older devices, since a large share of devices in-market don't yet support RuntimeShader. Prototype shaders on `shaders.skia.org` before wiring, and profile GPU on a mid-range device.
- **Token contract:** all `:feature:*` surfaces are specified Hyle-agnostic against a token interface, so Hyle can be swapped or reskinned without touching feature code.

## 6. Testing (tiered: static/JVM first, emulator second)

- **Tier 1 — JVM unit tests (fast, run on every save over SSH):**
  - DSP math against **synthetic fixtures**: pure sine at known Hz (A4=440, sweep 55–2100 Hz), sawtooth, and two-tone signals; assert detected f0 within ±5 cents for clean sines.
  - Timbre math: assert spectral centroid of a synthetic bright vs. dull spectrum orders correctly; tristimulus components sum to 1.0.
  - Baseline engine: deterministic trend detection on synthetic session series.
  - Session-bundle JSON round-trip (export → import → deep-equal), including `schemaVersion` migration tests.
- **Tier 2 — pitch-accuracy golden tests:** curated reference recordings (sax long tones, scales) with hand-labeled f0 tracks; assert engine RPA against golden within tolerance. Store fixtures in `:test-fixtures`.
- **Tier 3 — Compose UI tests + emulator:** state rendering, colorblind-encoding presence (assert every state node exposes a non-hue encoder in its semantics), navigation. Run last, over `adb`.
- CI note: as a solo dev over SSH, keep CI as **human-initiated Gradle scripts**, not a hosted CI service — hosted CI is a documented maintenance-cost trap for a team of one ("a maintenance burden — a trade-off that does not make sense for a team of one").

## 7. Naming

**Do not ship "Baseline for Music" as the store name** — "Baseline" is the cross-domain engine brand, not this app. Working names were screened for collisions (Play Store, App Store, domains, obvious marks; this is a first-pass availability scan, NOT formal legal clearance).

**Screened candidates and verdicts:**
- **Sostenuto — HIGH RISK, avoid.** "Sostenuto: Music Practice App" already exists (Apple App Store, dev Valerio De Feo, id 6760582882, sostenuto.app) — a spaced-repetition practice app with a chromatic tuner, instrument detection, session logging, practice heatmaps and explicit woodwind support. Head-on category-and-name collision, the worst of the set.
- **Cantabile — HIGH RISK, avoid.** Established live-performance music software by Topten Software (cantabilesoftware.com), a VST host for performers since 2006.
- **Woodshed / Woodshedder — HIGH RISK, avoid.** Crowded practice-app space: "Woodshed Speed Trainer," "Woodshedding," "Woodshedr," "Woodshedder" all exist.
- **Reedly — MEDIUM-HIGH.** Multiple existing "Reedly" apps (a sales-report app `com.reedly.app`, a book reader reedly.io, RSS readers) plus a strong phonetic clash with **Readly** (major magazine subscription app).
- **Ligature — MEDIUM.** "Ligature Practice" music app exists; bands named Ligature; low distinctiveness (also a typography/notation term). Least category-colliding of the five but weak to protect.

**Recommended candidates (low apparent collision, fit the Baseline/Crocodyl/Hyle/FoneBru portfolio style — obscure real words + coinages):**
1. **Bocal** *(primary)* — the curved metal crook on bassoons/English horns through which the player blows. Obscure, breath/wind-specific, one word, highly distinctive, no app collision found. Recommended.
2. **Overblow** — a real woodwind technique (overblowing into upper registers/harmonics). Evocative, breath-specific, no music-app collision found.
3. **Fipple** — the breath-channeling block of a recorder/whistle. Quirky, memorable, distinctive, no collision found.
- Coinage options in the FoneBru/Crocodyl vein if a made-up word is preferred: **Reedwake**, **Sylphon**, **Aeryl**.
- **Next step before adoption:** formal USPTO (TESS) and EUIPO (eSearch) check in Nice class 9 (software), plus a `.com`/`.app` domain sweep, on Bocal + Overblow.

---

# DELIVERABLE 2 — Strategic Analysis: Multiplier Effect or Delulu?

**Bottom line:** Madhav is **more right than delulu, but the thesis needs to be cut down.** There is a real, defensible resonance effect — but it lives almost entirely at the level of **shared code infrastructure and a consistent design/brand identity**, not at the level of "network effects" or a "cross-domain product." The failure mode he should fear is not that the synergies are fake; it's **half-finished portfolio syndrome** — spreading a solo dev across six coupled projects until the shared core becomes a maintenance tax rather than a leverage multiplier.

## What the evidence says about multi-product indie strategies

- **The portfolio approach is legitimate and common.** Many profitable solo devs run portfolios of small, related products for overlapping audiences, because cross-selling an existing customer is far cheaper than acquiring a new one, and a portfolio smooths the high failure rate of individual apps. Tony Dinh, for example, describes running three products where "Black Magic ... at $11K MRR ... DevUtils and Xnapper ... average out about $3K–$6K a month each ... total revenue per month is about $15K–$20K from all 3." His stated motivation engine is dogfooding: "using your own products every day is the best advantage you can give yourself as an indie hacker. Without this, it is very difficult to find the motivation to keep improving the product." That maps directly onto Madhav's FoneBru-dogfooding loop.
- **But focus still wins per-product.** The same community is blunt: splitting focus means each product takes longer to succeed; "as an investor/founder ... running multiple products is a huge red flag"; momentum is lost on every context-switch. The reconciliation the successful ones land on: **build small, ship one, put ~60% of active energy on the highest-leverage product in a 30-day window, keep the rest at maintenance level.**
- **Shared-core coupling is a double-edged sword.** Cross-app shared libraries reduce duplicate maintenance *only if the shared surface is small and stable*. When a shared core is coupled to two domains with different needs, every change risks breaking both consumers. For a solo dev this is the specific, documented trap.
- **The best analog is Obsidian, not Tasker/Panic.** Obsidian's "local-first, file-over-app" model (a philosophy from Obsidian CEO Steph Ango) is exactly Madhav's backendless thesis — and pricing analyst Robin Landy notes it "has limited collaboration features and weak network effects. The file-over-app philosophy makes Obsidian primarily a single-player experience." Its moat is *combinatorial extensibility + brand trust*, not network effects. Translation: Madhav should not expect network effects from a backendless portfolio. He should expect **brand trust and shared-infrastructure efficiency** — which are real but different.

## Synergy-by-synergy assessment

### 1. Hyle design system → WIRE UP FIRST. Verdict: clearly correct, lowest risk.
A shared token/shader/colorblind-palette library is the canonical "small, stable, shared surface" that actually pays off for solo devs. It enforces brand consistency (the trust moat), it's low-coupling (tokens rarely change in breaking ways), and the colorblind-safe encoding system is genuinely reusable across archery, music, and everything else. This is not delulu; it's best practice. **Do it, keep it open-source (Apache-2.0), version it.**

### 2. Haptics IR → the tuner's feedback channel → WIRE UP FIRST (as consumer, not co-development). Verdict: strong, and technically validated.
This is the most *product-meaningful* synergy and the research validates it precisely. Android's modern haptics API already models haptics the way his IR does: the **PWLE / envelope APIs operate on a "human perception scale for intensity and sharpness,"** and `VibrationEffect.Composition` sequences scalable primitives (CLICK/TICK/SLOW_RISE/QUICK_FALL/THUD/SPIN) with per-primitive `scale` and `delay`. In other words, **breakpoint curves of intensity+sharpness are exactly what the platform consumes** via `BasicEnvelopeBuilder`/`WaveformEnvelopeBuilder` control points — his canonical IR maps almost 1:1.
- **Concrete wins:** feel intonation drift without looking (sharpness rising as you go sharp, a centered "lock" pulse when in tune) — this is *especially* valuable for a colorblind-founder-led app because it's another non-visual, redundant state channel. Metronome haptics fall out for free (the platform even documents "audio-coupled haptics").
- **Critical caveat:** rich haptics require capable actuators, and "if a composition contains primitives that aren't supported by the device, the entire VibrationEffect.Composition won't play any vibration" — always check `areEnvelopeEffectsSupported()` / `arePrimitivesSupported()` and fall back. The RedMagic 11 Pro has a strong actuator; many mid-range devices won't.
- **The right coupling:** let the music app be the **first production consumer** of the haptics IR *format* (a data contract), but do **not** co-develop the full haptics authoring workbench in lockstep with the music app. Ship a minimal `:core:haptics` renderer that reads the IR and emits `VibrationEffect`s. The workbench can mature independently.

### 3. Baseline as a shared longitudinal engine (sport + music) → WIRE UP, but only at the data-contract level. Verdict: coherent thesis, but "multi-sport + music unified platform" is scope creep as a *product*.
The **engine-sharing** is real and defensible: longitudinal trend analysis (rolling baselines, change-point/plateau detection, improvement-over-time) is genuinely domain-agnostic — a time series of "performance scores per session" is the same math whether the score is arrow-grouping tightness or pitch-accuracy-per-note. Making music the **second domain** that consumes the same `:core:baseline` is exactly the kind of small, stable shared core that works.
- **Where it becomes delulu:** pitching "Baseline: the cross-domain practice-intelligence engine for sport *and* music" as a single marketed product. Archers and saxophonists are different audiences with essentially zero overlap; there's no cross-sell, no network effect, and a unified consumer brand confuses both. The coupling risk is also highest here (two live consumers of one closed engine).
- **The right move:** keep `:core:baseline` as a **private shared library with a strict, versioned interface** (`fun analyze(series: List<SessionScore>): TrendReport`). Music and archery are separate apps that depend on it. Market them separately. The "platform" is an internal engineering fact, not a product.

### 4. Urbana (local LLM daemon) → LEAVE AS A SEAM. Verdict: right instinct, wrong time.
Local AI practice summaries that keep the backendless promise are a genuinely elegant fit — architecturally, an OpenAI-compatible localhost server on port 11435 means the app could generate summaries via a purely local HTTP call. **But:**
- It **breaks the "no INTERNET permission" superpower.** Even localhost HTTP typically requires the INTERNET permission, which forfeits the single cleanest "No data collected / cannot phone home" marketing claim and complicates the Data Safety story. That trade-off is too expensive for MVP.
- It couples the app to Urbana being installed/running — a hard dependency on another of his in-progress projects (portfolio syndrome).
- **Right move:** design a clean `SummaryProvider` seam now (interface returning a session summary from structured metrics), ship a **template-based, fully-offline summarizer** as the default (no permission, no dependency), and keep an Urbana-backed implementation as an optional, clearly-flagged power-user add-on for later. Do not let it into the MVP dependency graph.

### 5. FoneBru (agentic on-phone IDE) → this is the meta-layer, not a synergy to "wire up."
Every app being dogfooding for FoneBru is real and valuable (it's his build environment and motivation engine), but it's orthogonal to the product's user-facing value. Keep it as the delivery mechanism; don't count it as a product synergy.

## Failure modes to actively manage
- **Half-finished portfolio syndrome** is the #1 risk. Mitigation: the 30-day focus-window discipline — Bocal MVP gets ~60% of active energy until it ships; Hyle/haptics/Baseline are touched only at their stable interfaces.
- **Shared-core coupling tax.** Mitigation: strict versioned interfaces on `:core:baseline` and `:core:haptics`; never let a music-specific need leak a breaking change into the archery consumer.
- **License contagion** (the concrete, near-term landmine): GPL TarsosDSP/pYIN would poison the closed Baseline engine. Keep them out entirely.
- **Maintenance spread on CI/infra.** Mitigation: no hosted CI; human-initiated Gradle; backendless means zero server ops (a genuine advantage of the constraint).

## Concrete recommendation
- **Wire up first (3):** (1) **Hyle** tokens/colorblind system, (2) **haptics IR as the tuner's non-visual feedback channel** via a minimal `:core:haptics` renderer, (3) **`:core:baseline`** as a shared, versioned, closed longitudinal engine consumed by music as domain #2.
- **Leave as clean seams (2):** **Urbana** (behind a `SummaryProvider` interface, offline template default) and the **file-based coach exchange** (design the bundle/annotation contract in MVP, build in v3).
- **Ignore/deprioritize as product theses:** "Baseline multi-sport + music unified *product*," and any Urbana dependency in MVP.
- **Benchmark that would change this:** if Bocal MVP reaches meaningful retention AND the haptics IR has stabilized across ≥2 shipped apps, *then* promote the haptics workbench and the Urbana summarizer from seams to wired features. Until MVP ships and retains, everything except Hyle / haptics-renderer / Baseline-interface stays a seam.

## Caveats
- Latency numbers (<20 ms) are device- and configuration-dependent; MMAP EXCLUSIVE is not guaranteed and Bluetooth mics blow the budget — ship self-calibration and never assume.
- SwiftF0's benchmark figures (91.80% HM @ 10 dB SNR, 42× vs CREPE, 132.6 ms/5 s clip) are the author's published results (arXiv:2508.18440); validate on-device with your own golden sax fixtures, and note the ~2093 Hz ceiling for altissimo.
- AGSL/`RuntimeShader` support is limited to API 33+ and a fraction of in-market devices; treat shaders as progressive enhancement, not core UI.
- Name screening is a first-pass availability scan, not legal clearance — do formal TM/domain checks before committing to Bocal.
- Streak-mechanics research is consistent that rigid all-or-nothing streaks backfire (loss-aversion anxiety, quit-on-break; missing a single day does not materially harm habit formation). If you ship streaks, ship grace days / "never miss twice" / taper pressure after the habit forms — this is flagged so it's designed in, not bolted on.
- The strategic verdict is a judgment call grounded in indie-developer case evidence (Obsidian, Tony Dinh, community consensus), not a guarantee; the single most important discipline that determines whether the "resonance" is real or delulu is shipping the Bocal MVP to retention *before* expanding the shared-core surface.