# Bocal

Local-first music practice: a stable-note tuner, metronome, tone generation, local recording/analysis, practice evidence and instrument learning.

**Release state: v0.6.0 production-hardening candidate, not an accepted production V1.** Read [current capabilities](docs/CURRENT_STATE.md), [verification evidence](qa/VERIFICATION.md), and the [production acceptance gates](docs/PRODUCTION_V1_ACCEPTANCE.md). A green build does not replace physical audio testing or specialist musical review.

## One maintained application

| Directory | Role |
| --- | --- |
| `web-source/` | Canonical React/TypeScript product, used by both browser and Android |
| `android/` | Local WebView shell and APK/AAB packaging for that same app |
| `scripts/` | Packaging, dependency and runtime verification helpers |
| `docs/` | Current state, release acceptance, product/design handoff and historical research |
| `web-source-v6/`, `web-standalone/`, `models/glb/` | Historical prototypes/reference assets; not production build entry points |

The maintained app has ten instrument profiles and **two** licensed detailed 3D models (alto saxophone and Howarth oboe). The other sax profiles use the alto model; cor anglais uses the oboe model; flute/clarinet/bassoon have charts rather than equivalent 3D labs. See [model attribution](web-source/public/models/ATTRIBUTION.md). Historical counts of 35 generated models do not describe production readiness.

## Run the maintained web app

Use Node 22.13 or newer and the committed lockfile:

```sh
cd web-source
npm ci
npm run preview:standalone
python3 -m http.server 8080 --directory preview-dist --bind 127.0.0.1
```

Open the localhost address in a browser. `preview-dist/index.html` is the generated shared standalone application. For remote browser microphone access, use a secure HTTPS origin rather than an insecure LAN HTTP page.

The hosted development/build commands remain `npm run dev` and `npm run build`; see [web-source/README.md](web-source/README.md) for hosting details. Do not edit generated standalone HTML.

## Verify

From `web-source/`:

```sh
npm test
npm run lint
npm run build
node --test tests/*.dist-test.mjs
npm run preview:standalone
npx playwright install --with-deps chromium
node tests/theme.test.mjs
npm run test:e2e
node tests/production-smoke.mjs
node tests/reliability-e2e.mjs
node ../scripts/audit-dependencies.mjs --enforce
```

The explicit browser commands matter: some browser checks are skipped when their built preview is absent from a unit-only run. Production smoke tests use real IndexedDB and a Chromium fake capture device; they do not measure a physical microphone.

From the repository root:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
```

## Android

Install the web dependencies above, an Android SDK with the project's compile platform/build tools, and JDK 21. Then:

```sh
cd android
./gradlew lintDebug lintRelease assembleDebug assembleDebugAndroidTest assembleRelease
```

Gradle generates and stages the canonical web application. The debug workflow verifies that the APK contains the exact tested standalone payload, compiles the minified release variant, and runs separate emulator instrumentation. Debug builds are for testing, not production distribution.

The signed-candidate workflow requires the owner-controlled upload keystore configuration described in [Android documentation](android/README.md). It does not select a permanent signing identity or automatically publish to a store. Before replacing an installed build with a differently signed APK, export important local data; uninstalling to bypass signature mismatch can erase it.

## Production scope and boundaries

Recording storage failures are visible; request success is not treated as a committed transaction. Imports/capture are bounded, old recordings are not silently evicted, deletes are confirmed, and Android exports use a system Save As picker. The shared quality gate rejects high/critical dependency findings and retains test/security evidence.

Physical-device audio/routing/rotation/accessibility/performance, real signed-release installation, final visual approval and specialist fingering validation remain explicit acceptance gates. No TonalEnergy superiority or full 3D parity across every instrument is claimed.

The previous root README is retained in [the historical archive](docs/archive/README-before-v1-hardening.md). It is not a current build guide.
