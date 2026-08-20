# Bocal debug APKs

These APKs are engineering builds signed with the Android debug certificate. They are suitable for sideloading and device QA, not Play Store release.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `Bocal-native-debug-0.2.0.apk` | Current installable app | `eba6d45814e782701faffae842a70f20dfd6dbf94de4ff9e79eec9ca5b543c22` |
| `Bocal-native-debug-androidTest-0.2.0.apk` | Instrumentation companion used by connected-device tests | `fb89d1fec627539655c01c7a86fd849eb91d76a2ee3434adbc4323f74ddb28c3` |
| `Bocal-native-debug-0.1.0.apk` | Previous native foundation build | `73f885c2643b76c3255c00aa9095e5f5851684a4f2633d36faacb4446915526d` |

`latest-debug-apk.txt` selects the app APK copied into the generated website download directory by `scripts/stage-debug-apk.sh`.

The current build declares microphone access but deliberately declares no Internet permission. Physical-device results must be recorded with `android/PHYSICAL_DEVICE_TEST_PLAN.md`; a successful desktop build is not a substitute for hardware verification.

> Note: `Bocal-native-debug-0.1.0.apk` (superseded foundation build) was omitted from the repository; it remains in the original "Bocal Complete Assets Aug 17 2026" archive.
