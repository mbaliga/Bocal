# Production V1 acceptance

Owner-facing release gate, 17 September 2026. Leave an item unchecked until its evidence exists. Do not convert this checklist into a statement that testing was completed.

## Candidate identity

Record the source SHA, Actions run, APK/AAB SHA-256, versionCode/versionName, signing-certificate fingerprint, device model, Android/WebView versions and tester/date. Test the exact file that will be distributed. A debug APK, unsigned release build or temporary-key build is not a signed production release.

## Automated gates

- [ ] Latest candidate passes shared web quality (typecheck, unit tests, lint, hosted and standalone builds).
- [ ] Explicit contrast and original E2E checks pass; production smoke report confirms real IndexedDB import/rename/reload/download/delete, capacity protection, fake-device capture cleanup and compact/landscape/tablet layouts.
- [ ] Fresh dependency audit reports zero low, moderate, high or critical findings.
- [ ] Android debug, instrumentation APK and minified release variant compile; debug/release lint passes.
- [ ] Packaged application is byte-identical to the tested standalone bundle and contains both licensed instrument models.
- [ ] Android API 26 and API 35 emulator installation/runtime tests pass, with logs retained. Emulator results remain distinct from physical-device acceptance. The API 26 `google_apis` image ships Chrome 69 as its system WebView, which is also Bocal's WebView floor (Chrome 69 -- Android System WebView from mid-2018), so that image exercises the floor exactly rather than merely running on old `minSdk`. Below the floor the app shows a native "update WebView" screen instead of a blank page; it does not attempt to load the bundle.

## Physical device gates

Use the user's RedMagic plus a representative lower-resource/API-26-compatible device where available. Record failures rather than marking untested paths as passed.

- [ ] Fresh installation, cold launch, permission denial/grant/revocation, no microphone prompt before deliberate listening.
- [ ] Low/mid/high sax long tones; octave errors, cents stability, note acquisition/dropout, room noise; comparable labelled recordings for other advertised instruments.
- [ ] Speaker/wired/Bluetooth route changes, interruption by calls/other apps, screen lock, background/resume; no unintended microphone/audio restart.
- [ ] Recording/import, rename/delete cancellation, 12-take limit, full-disk/storage failure, app restart, and exported audio/transcription re-open correctly.
- [ ] Save As succeeds and cancels clearly on older and current Android; large exports fail visibly without deleting originals.
- [ ] Portrait and landscape on both navigation edges, gesture/button system navigation, large fonts/display scale, TalkBack focus and labels, hardware keyboard.
- [ ] Sax/oboe rotate/zoom/pick for a sustained session, instrument switching, rotation and renderer recovery; verify key glows target plausible controls.
- [ ] Sustained tuner + metronome/analysis sessions assessed for timing, heat, battery and memory.
- [ ] Upgrade from the installed previous build preserves practice and takes. Do not uninstall the existing app merely to bypass a signing mismatch without exporting data first.

## Musical and visual acceptance

- [ ] A qualified player/teacher reviews primary and alternate sax fingerings, transposition, key/touch-piece mappings, extreme register claims, and charts for each additional instrument.
- [ ] Owner approves the actual arc-navigation rendering and cinematic model presentation from this candidate, not reference images or an older build.
- [ ] Marketing distinguishes the alto-based sax proxies, oboe-based cor anglais, chart-only instruments and lack of expert certification. No unsupported TonalEnergy-superiority claim.

## Signing and distribution

- [ ] Owner-controlled permanent upload keystore selected and backed up. Configure BOCAL_UPLOAD_KEYSTORE_B64, BOCAL_UPLOAD_KEYSTORE_PASSWORD, BOCAL_UPLOAD_KEY_ALIAS and BOCAL_UPLOAD_KEY_PASSWORD as repository/environment secrets, never committed source.
- [ ] Signed APK/AAB workflow succeeds; verify the expected certificate (not Android Debug), package/version and exact payload checksums.
- [ ] Install and re-test the minified, genuinely signed build on physical hardware.
- [ ] Store metadata/screenshots, model attribution, privacy/data-safety disclosures and support contact match shipped behaviour. Local recordings remain on-device except deliberate export to a chosen provider.
- [ ] Owner authorizes production promotion, version bump/tag and distribution after reviewing the evidence.

## Follow-on, not concealed completion

Dedicated accurate 3D models for soprano/tenor/baritone, cor anglais, flute, clarinet and bassoon are separate asset/licensing/validation work. Do not count historical generated model files as completed production experiences. The candidate keeps existing functionality rather than expanding that scope with unvalidated assets.
