# Bocal 0.2 reference handoff

This folder is the complete downloadable handoff for the Bocal music-learning product direction dated 10 August 2026.

## Start here

- `docs/Bocal_Product_Handoff.pdf` — fastest way to review the product, research, personas, workflows, UX, parity scope, architecture, validation plan and baseline delta.
- `web-standalone/dist/` — ready-to-host static app. Serve this folder over HTTPS for microphone access.
- `web-standalone/` — TypeScript/Vite source for the standalone app.
- `models/` — 35 original educational woodwind GLBs, catalog, generator and validator.
- `android/` — native Kotlin/Jetpack Compose Android Studio project with the complete static 3D lab embedded locally.
- `web-source/` — source correction for the earlier hosted Sites application, including the client-only 3D loading boundary.
- `research/` — 84-row TonalEnergy parity matrix, 10 personas × 5 workflows, source ledger and detailed delta from the supplied baseline.

## Verified in this handoff

- The standalone web app builds with Vite and its smoke suite passes: 35 instruments and six task workspaces.
- All 35 GLBs parse as glTF 2.0 binary files and agree with the catalog; 465 named interactive controls validate.
- The 27-page DOCX/PDF handoff was rendered and visually reviewed page by page.
- The Android manifest requests microphone and vibration permissions and deliberately does not request Internet access.
- The Android asset bundle contains the same static app and 35 models as the standalone build.

See `qa/VERIFICATION.md` for commands and boundaries.

## Important release truth

No APK binary is included. This execution environment has Java 17 but not the Android SDK, Platform/Build Tools, `aapt2`, Gradle executable, or wrapper JAR. The supplied project is the source intended to build the APK, but it still requires a real Android Studio/SDK compile, unit-test, install and device-validation pass. `android/build-apk.sh` and `android/verify-apk.sh` document and enforce that path.

The 3D models are educational reference geometry, not repair/CAD models. Alto saxophone has the first core note map. The remaining instruments expose recognizable parts and interactive controls but must not be presented as certified fingering tutors until family specialists approve their note maps and mechanisms.
