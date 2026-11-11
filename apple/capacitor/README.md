# Bocal on iPadOS and iOS (Capacitor 8 scaffold)

Status: scaffold. Nothing here has been opened in Xcode or run on a Simulator or device. It was generated with
`cap add ios` (Capacitor 8.6.0) on Linux and then edited by hand; the lint below is static and does not prove Xcode accepts
the project.

The host loads `web-source`'s standalone bundle unchanged. `scripts/stage_bundle.sh` copies it byte for byte to `www/index.html`
(gitignored). Bundle id `com.asoc.bocal` follows the program's `com.asoc.<appname>` rule; the `NAMES.md` row is the owner's.

## What is here

| Path | Purpose |
| --- | --- |
| `capacitor.config.json` | `appId`, `webDir: www`; no `server` block, no navigation or cleartext exceptions. |
| `scripts/stage_bundle.sh` | Stages the built bundle; never edits it. |
| `ios/` | `cap add ios` output (SwiftPM, iOS 15 minimum, iPhone and iPad). |
| `ios/App/App/Info.plist` | `NSMicrophoneUsageDescription` (wording follows `docs/store/privacy-policy.md`), no `UIBackgroundModes`, no App Transport Security exception. |
| `ios/App/App/PrivacyInfo.xcprivacy` | No tracking, no tracking domains, no collected data, no required-reason API of our own (the app has no native code yet), added to the target's Resources phase by hand. |
| `lint.py`, `test_lint.py` | Stdlib lint and its tests. |
| `../../.github/workflows/ios.yml` | Unsigned Simulator build on `macos-latest`, only while the repository is public; no artifact, no secrets. |

## Not built yet (needs plan items IOS-2 and IOS-3)

The `window.bocalHost` shim (local Swift plugin plus a `WKUserScript`), the save picker, keep-awake, theme, `openExternal`,
the `bocal:host-pause` dispatch and the `AVAudioSession` choice. Until they exist the app runs, if it builds, without a host
bridge, so exports use the browser fallback, which is a silent no-op in a WKWebView. Do not ship this scaffold. The contract
to implement is `packaging/host-bridge/CONTRACT.md`; check the result with `packaging/host-bridge/conformance/`.

## Commands

```
cd web-source && npm ci && npm run preview:standalone
cd ../apple/capacitor && npm ci && bash scripts/stage_bundle.sh && npx cap sync ios
python3 -I lint.py && python3 -I -m unittest discover -s . -p 'test_*.py'
```

## OWNER_STEPS

Everything below needs your Apple account, a Mac or a device. None of it has been done or checked.

1. Add the `NAMES.md` row for `com.asoc.bocal` (or change the id in `capacitor.config.json` and the Xcode project together; the lint
   requires they match).
2. Enrol in the Apple Developer Program.
3. On a Mac, open `ios/App/App.xcodeproj`, choose your team under Signing & Capabilities (do not commit the team id; the lint
   rejects `DEVELOPMENT_TEAM`), and confirm the project builds and `PrivacyInfo.xcprivacy` is in the Copy Bundle Resources
   phase. Check the first build for the `-scheme App` name that `ios.yml` assumes.
4. Open Xcode's privacy report and confirm it matches the manifest once the Swift plugin exists.
5. App Store Connect: create the app record, answer the export-compliance question (`ITSAppUsesNonExemptEncryption` is left
   unset on purpose), App Privacy answers ("Data Not Collected"), and publish the privacy policy URL.
6. TestFlight uploads tester crash reports to you automatically (an Apple-side egress, approved by PT:D-AD on 2026-10-14);
   the store listing and about page must name that exception.
7. Device session on the iPad Pro M4: the physical gates of `docs/PRODUCTION_V1_ACCEPTANCE.md` restated for iPadOS
   (microphone permission, routes, interruption, lock, rotation, storage pressure, upgrade preserving takes).
8. iPhone 12 mini: the same list with phone layout rows added (the project already targets iPhone and iPad, `TARGETED_DEVICE_FAMILY = "1,2"`).
   Every iPhone item stays `NEEDS-DEVICE-VALIDATION` until you run it.
9. Pin the actions in `.github/workflows/ios.yml` and `host-bridge-conformance.yml` to commit SHAs (plan rule R3); they use
   `@v4` tags like the existing workflows because SHAs could not be resolved offline.
10. Signing, notarisation (macOS), `.ipa` export and TestFlight jobs are deliberately absent. Add them behind a
    required-approval environment when you are ready (OQ-3).
