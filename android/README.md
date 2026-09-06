# Bocal Android

Bocal for Android is a thin, hardened WebView host around the same web app
that ships at `web-source/`. There is no separate native Kotlin product
surface any more -- `MainActivity` loads one `WebAppScreen`, which serves
`assets/www/app.html` (the `preview:standalone` build of `web-source/`) from
the local `https://appassets.androidplatform.net` origin.

## Why a real https origin, not `file://`

Chromium treats `file://` as an insecure origin, which silently disables
`getUserMedia` -- the tuner's microphone would never open. `WebViewAssetLoader`
serves bundled assets under a real `https` origin instead, which keeps the
full web platform surface (including mic capture) available.

## The native bridge: `window.bocalHost`

`BocalHost.kt` implements the `@JavascriptInterface` the web app calls
defensively as `window.bocalHost?.…`:

- `setTheme(theme)` -- syncs the status/navigation bar icon color and window
  background to the page's light/dark theme.
- `setKeepAwake(on)` -- toggles `FLAG_KEEP_SCREEN_ON` while the tuner,
  metronome or drone is running.
- `saveFile(name, mime, base64)` -- writes into `MediaStore` Downloads; the
  web app falls back to its `<a download>` path when this bridge is absent
  (i.e. in a regular browser).
- `openExternal(url)` -- opens `http(s)` URLs in the system browser (model
  credit links, reference sources).

`WebAppScreen` also forwards `ON_PAUSE`/`ON_RESUME` lifecycle events: on pause
it calls `webView.onPause()` and dispatches a `bocal:host-pause` DOM event so
the web app stops the microphone (and, per its own decision, the
metronome/tone generator); nothing restarts automatically on resume.

## Hardening

- `allowFileAccess`/`allowContentAccess`/`allow*FromFileURLs` all off; mixed
  content never allowed; no popups or multiple windows.
- `LocalAssetWebViewClient` rejects every request that is not
  `https://appassets.androidplatform.net`, opens `http(s)` navigations in the
  system browser instead of loading them in-app, and recovers from renderer
  process death by destroying and recreating the WebView.
- The manifest declares only `RECORD_AUDIO` and `VIBRATE` -- no `INTERNET` --
  and `android:allowBackup="false"` (practice history and takes are the app's
  own local data and should not go through Android Auto Backup).
- The WebView is padded by `WindowInsets.systemBars` so the page draws below
  the status bar rather than under it.

## Building

The APK bundles the web app verbatim, so `assets/www/app.html` must exist and
be current before Gradle packages it -- it is *not* committed (see
`.gitignore`). The `stageWebApp` Gradle task (wired into `preBuild`) runs
`npm run preview:standalone` in `web-source/` and copies the result in:

```bash
./gradlew assembleDebug --console=plain
```

In CI, the web build runs once in a separate `web` job and the resulting
bundle is downloaded into `assets/www/app.html` before Gradle runs with
`BOCAL_SKIP_WEB_BUILD=1`, so the `apk` job needs no Node toolchain.

`verify-apk.sh` checks the APK container and, when `apkanalyzer` is
installed, prints application ID and permissions.

## Release builds

`buildTypes.release` has `isMinifyEnabled`/`isShrinkResources` on. Signing is
guarded so a checkout without the secrets below still compiles a (verifiably
unsigned) release build:

| Secret | Contents |
|---|---|
| `BOCAL_UPLOAD_KEYSTORE_B64` | base64 of the upload keystore (`.jks`) |
| `BOCAL_UPLOAD_KEYSTORE_PASSWORD` | keystore password |
| `BOCAL_UPLOAD_KEY_ALIAS` | key alias inside the keystore |
| `BOCAL_UPLOAD_KEY_PASSWORD` | key password |

Generate an upload keystore once with `keytool` and store it as the base64
secret above; Play App Signing then holds the real app-signing key, so losing
the upload key is recoverable. `.github/workflows/release.yml` runs
`./gradlew bundleRelease` on version tags (`v*`) or manual dispatch, only when
all four secrets are present, and uploads `app-release.aab`.

`fastlane/Appfile` reads a Play Console service-account key from the
`SUPPLY_JSON_KEY` environment variable for `fastlane supply`.

## Toolchain

- JDK 21 (CI), source/target compatibility 17
- min SDK 26, compile/target SDK 37
- Android Gradle Plugin 9.3.0, Gradle wrapper 9.7.1
- Kotlin/Compose compiler plugin 2.3.21, Compose BOM 2026.06.00
- AndroidX WebKit 1.17.0

## Checks

```bash
./static-check.sh      # manifest/XML sanity, no dead files, native bridge present
./build-apk.sh          # assembleDebug + verify-apk.sh
./device-release-check.sh [apk]  # adb install, cold launch, crash check, UI reachability (needs one connected device)
```

`BocalSmokeTest` (`app/src/androidTest/`) asserts the WebView is displayed and
has navigated to the bundled app; run it with `connectedDebugAndroidTest` on
an emulator or device.

## What is intentionally not here any more

The previous native Kotlin/Jetpack Compose product surface (a six-screen
Compose UI, five audio engines, a practice store, and a Three.js-based
in-app 3D Lab loaded from `assets/www/lab.html`) has been deleted. The web
app is the product; the WebView hosts it verbatim, including its own 3D lab
for saxophone and oboe (models inlined as base64 GLBs inside `app.html`).
Deleting that tree took the debug APK from ~34 MB to ~19 MB with no
user-visible change, since nothing reachable from `MainActivity` ever loaded
it.
