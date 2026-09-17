# Bocal Android build status

Updated 17 September 2026 for the production-hardening candidate in PR #9.

The maintained Android shell uses `web-source/` and generates `assets/www/app.html` from the standalone build. Version is **1.0.0-rc.1 / versionCode 8**, compile/target SDK 37, minimum SDK 26. Do not rely on the superseded August v0.5 build record for current acceptance.

## Build verification

The first hardening checkpoint ba04fafdab73f3bafaac13b514422015f85248ec passed Actions run 35151199901, including debug and minified release compilation, debug/release lint, instrumentation APK compilation and exact tested-payload checks. Later commits additionally update dependencies, recording lifecycle and runtime tests. Their verification must come from their own Actions run in PR #9, not this earlier checkpoint.

The current workflow builds the debug APK and instrumentation APK, verifies both debug and minified release web payloads, then installs/runs the debug instrumentation suite in an API 35 emulator. A compiled instrumentation APK alone does not mean those tests ran. Refer to the separate emulator job and retained logs.

## Distribution boundary

`bocal-debug-apk` is for testing, not a signed production distribution. The signed-candidate workflow requires the four owner-controlled upload-keystore secrets, builds APK and AAB, verifies signatures/payload identity and emits checksums. It neither manufactures a permanent signing identity nor automatically publishes a release.

Real-device acceptance (including older Android, audio routes, lifecycle, native Save As, TalkBack, portrait/landscape arc and heat/battery), expected production certificate validation and specialist musical review remain explicit gates in `../docs/PRODUCTION_V1_ACCEPTANCE.md`.
