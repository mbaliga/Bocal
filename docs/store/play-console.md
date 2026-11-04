# Bocal — Play Console answer sheet

> Only the **deltas** from `Personal-Tracker/store/HOUSE_DEFAULTS.md`. Metadata is
> under `android/fastlane/...` because the Android app is one target in a
> multi-surface repo (web standalone, two Next.js variants, models, research).
>
> Re-verified 2026-11-04 against `main` @ `f10ed32`: source, workflows, and Google's help
> pages fetched that day. This replaces a sheet that commit `32a3860` had overwritten with
> an older draft (0.6.0 / versionCode 7, no WebView section, an open-ended licence audit).
> Nothing here has been built in release form or run on a device.

| | |
|---|---|
| applicationId | `com.bocal.music` (permanent once published) |
| Version | `1.0.0-rc.1` (versionCode `8`), minSdk `26`, targetSdk `37`, compileSdk `37` |
| Category | **Education** or **Music & Audio**: an owner call. Google's pages give example listings only and no policy consequence for either. Education does not by itself trigger Families or Teacher Approved. |
| Tags | at most five, for example `tuner`, `music practice`, `saxophone`, `woodwind`, `fingering chart` |
| Contact email | `bocal@asystemofcells.com` |
| Website | `https://asystemofcells.com/bocal` |
| Privacy policy | `https://asystemofcells.com/bocal/privacy` (working copy: `privacy-policy.md`) |

> **What ships:** the WebView shell under `android/` (`MainActivity` -> `WebAppScreen`),
> serving a single generated file, `assets/www/app.html` (built from `web-source` by
> `npm run preview:standalone`), from the virtual origin
> `https://appassets.androidplatform.net`. The legacy Next.js variants and `web-standalone`
> do not ship to Play.

## Where this stands

- The app has 13 instruments (nine woodwinds, two harmonicas, guitar, and a Vocal stage).
  The store title, short description and full description had still described saxophone,
  woodwinds and guitar only.
- CI: the `Android debug APK` workflow passed on `main` @ `f10ed32` (run 121, 2026-10-28). It
  compiles the minified release variant but installs only the debug APK on its emulators.
- `release.yml` has **never run** (GitHub shows zero runs), and the repo has no tags. No signed
  build exists (`docs/CURRENT_STATE.md`).
- `qa/VERIFICATION.md` asserts no physical-device acceptance and no genuine production
  signing identity. `android/DEVICE_TEST_PLAN.md` has not been recorded as run.

## Blockers before the first upload

### 1. There is no uploadable artifact yet

- **Upload key and four secrets.** `BOCAL_UPLOAD_KEYSTORE_B64`,
  `BOCAL_UPLOAD_KEYSTORE_PASSWORD`, `BOCAL_UPLOAD_KEY_ALIAS` and `BOCAL_UPLOAD_KEY_PASSWORD`
  must all be set. The keystore is decoded with Java's basic Base64 decoder, which rejects
  line breaks, so encode it with `base64 -w0`; `android/README.md` does not say so. Let Play
  manage the app signing key and keep this one as the upload key.
- **`verify-aab.sh` would reject a normal upload key.** It runs `jarsigner -verify -strict`
  (`android/verify-aab.sh:36-39`), which exits non-zero for a self-signed signer. `release.yml`
  runs it before the upload step, so a first real run would likely fail there. This was
  tested on a synthetic AAB-shaped zip with JDK 21, not on a real AGP bundle. The same script
  passes an AAB-shaped zip that has no `META-INF` at all, so its "rejects unsigned bundles"
  claim in `android/README.md` is overstated.
- **The gates the old workflow had are gone.** `32a3860` removed the tag-versus-versionName
  check, the payload-identity check (`verify_android_artifact.py --expected-html`) on the
  AAB, `SHA256SUMS`, the 14-day candidate artifact and `needs: web`; `32b464b` kept that
  shape. A `v1.0.0` tag would build `1.0.0-rc.1` without complaint.
- **A missing-secrets mistake is found late.** The secrets check is step 10 of 14, after the
  web build, a debug build and an emulator run of up to 45 minutes.
- **`release.yml` has no `playwright install` step**, unlike `web-quality.yml`, so
  `test:e2e` and `test:theme` may fail on a clean runner (unconfirmed).
- **The dependency-audit gate has an expiry.** It runs only in `web-quality.yml`. Its one
  allowlist entry (GHSA-wx4j-mvgx-mqwp) expires 2026-12-27; after that the gate fails unless
  renewed (`scripts/audit-allowlist.json`).
- **R8 has been compiled but never run.** Minify and shrink are on for release. CI installs
  only the debug APK, so the `bocalHost` bridge, Save As and the update screen have not
  been seen working in a minified build. `proguard-rules.pro` keeps the `@JavascriptInterface`
  methods, which is the usual rule.
- **Nothing asserts the merged release manifest.** `static-check.sh` reads only the source
  manifest and no workflow runs it; `verify-apk.sh` prints permissions only if `apkanalyzer`
  is installed. Run `apkanalyzer manifest permissions` (or `bundletool`) on the signed AAB and
  confirm there is no `INTERNET` and no `AD_ID`.
- **Never upload the `beta` build type.** It is `initWith(debug)` with
  `applicationIdSuffix .beta`, so it is debuggable with WebView remote debugging on, and its
  own manifest adds `INTERNET` (a local-network session bridge that nothing in the UI
  reaches). Play rejects debuggable bundles, and every "no `INTERNET`" statement below is
  about the release variant only. The Play AAB comes from `bundleRelease`.
- **`versionName` is `1.0.0-rc.1`**, which shows on the app info page. Play accepts it. For
  production consider `1.0.0` with versionCode `9` (a code change that also renames the
  changelog to `9.txt`). The repo cannot show whether versionCode 8 was ever uploaded; since no
  signed build exists, it probably was not.
- **Store graphics are missing**: 512 px icon, feature graphic, screenshots
  (`android/fastlane/.../images/README.md`).

### 2. Behaviour a first-run reviewer or user would hit

All found by reading source; device-only unless stated.

| # | What | Where | Why it matters |
|---|---|---|---|
| 1 | **The first microphone grant probably does not start the tuner.** The system dialog pauses the activity; the shell sends `bocal:host-pause` on every `ON_PAUSE`, each mic starter cancels its request ticket on that event, and `stillCurrent()` also requires `!document.hidden`. After "Allow" the stream is stopped and discarded. A second tap works. A first "Deny" through the dialog shows no message at all, and there is no link to system Settings. | `WebAppScreen.kt:78-87,95-102,159-173`, `useTuner.ts:397-402,431,442-453,601`, `AnalysisView.tsx:291-292,316`, `VocalTakes.tsx:106-107,127` | Every fresh install and every "Only this time" grant. `DEVICE_TEST_PLAN.md` expects "starts without restart". No CI test drives the dialog. |
| 2 | **No privacy-policy link or text inside the app.** Google's User Data policy requires one in the Console field *and* "within the app itself". | grep of the shell and `web-source/app` | Add a Settings entry (open the policy URL, or bundle the text). Not on the old checklist. |
| 3 | **Dead or misleading UI in the Play build.** Settings offers a handoff "Download" whose file is not bundled (404; the shell's toast then says "Use the recording's Export button"), and a banner "Android release promotion is pending". The Coach "Export brief" uses a blob anchor that the shell turns into the same toast, so it saves nothing. Settings also lists unshipped, paid and blocked model candidates as links. | `DownloadCenter.tsx:38-54,101,108-111`, `PracticeTools.tsx:590-594`, `WebAppScreen.kt:142-144` | A reviewer opening Settings sees pipeline notes. A test asserts the banner string (`release-downloads.test.mjs:19`). |
| 4 | **Delete flows rely on `window.confirm`**, and the shell overrides no `onJsConfirm`. If the stock dialog does not appear, deleting a take, log entry or melody silently does nothing. | `AnalysisView.tsx:462`, `VocalTakes.tsx:295`, `MelodyTarget.tsx:379`, `PracticeTools.tsx:497` | The deletion claims in the policy rest on this. |
| 5 | **Deletion is partial.** There is no delete-all or reset. The lesson note, song wishlist, skill evidence, saved sessions and coach plan cannot be removed in the app. Records that fail validation are never listed, never counted toward the 12-take cap, and cannot be deleted in-app. | `takes-store.ts:78-85`, `practice-data.ts`, `PracticeTools.tsx:233-239` | "Users can delete data in the app" would overstate. The policy now says what can and cannot be removed. |
| 6 | **In-app copy contradicts the listing.** Onboarding says "Nothing leaves your device... stay in this browser"; Analyze says takes "stay in this browser"; the sax lab says the standard range "is checked on alto" and `sax-data.ts` says "teacher-checked", while every chart badge and `CURRENT_STATE.md` say no teacher has reviewed anything. | `InstrumentExperience.tsx:444`, `AnalysisView.tsx:548`, `SaxophoneLab.tsx:628,714`, `sax-data.ts:219` | A user reads "checked" as teacher-verified. "Browser" is wrong in an Android app. |
| 7 | **Export messages can lie.** "Saved." and "Saved to your downloads." appear as soon as the native request is queued, even if the user cancels the picker. | `PracticeTools.tsx:258-280` | Cosmetic honesty issue. |
| 8 | **Target 37 has only been compiled.** CI emulators run API 26 and 35. Edge-to-edge sets `setDecorFitsSystemWindows(false)` with no cutout or IME inset handling and no `windowSoftInputMode`; Back is a no-op if the page's callback is dropped; `configChanges` omits `fontScale`, `density`, `locale`, `layoutDirection`. | `MainActivity.kt:12`, `WebAppScreen.kt:108-125`, `AndroidManifest.xml:14-19` | Quality on Android 16 and 17, not a form item. |

Smaller, in the PR description: the phone dock's settings button still reads "TU"; the
onboarding counts temperaments as "11 built in, plus a custom" (code: 10 named plus Custom);
a take in progress is stopped and saved when the user leaves the screen; some caps drop the
oldest entries silently once full.

### 3. Owner decisions this sheet does not make

- **Title and brand.** `Bocal: Woodwind Lab` excluded harmonica, guitar and voice, and
  "Woodwind Lab" appears nowhere in the app (the launcher label is `Bocal`). The listing now
  uses `Bocal: Tuner and Practice`. Revert it if you want the old positioning.
- **Category** (Education or Music & Audio), and **versionName** (see above).
- **Licence.** There is no `LICENSE` covering `android/` or `web-source/`. Draft PR #21 would
  add PolyForm Noncommercial 1.0.0. See **F-Droid**.
- **Account type.** Google's page (fetched 2026-11-04) requires a personal account created
  after 2023-11-13 to run a closed test with at least 12 testers opted in for 14 days before
  production access, per app, and to verify an Android 10+ phone. Whether the A System of
  Cells account is personal or organisation is not recorded.

### 4. Outside the repo, not checked

`https://asystemofcells.com/bocal/privacy` returning 200 for a logged-out reader (and
matching the working copy), the `bocal@asystemofcells.com` alias delivering, and the Play
Console account state.

## Model licensing and attribution

Two third-party glTF models ship in the Android bundle, inlined as base64 in `app.html`. Both
are recorded as **CC BY 4.0** in `web-source/public/models/ATTRIBUTION.md`: "saxophone alto"
by ANDRIANIAINAToky and "Oboe - Howarth Conservatoire S20C (Instrument)" by WarderiiK. The
earlier CC BY-NC clarinet model was removed. The repo's 35 in-house models do not ship.

CC BY 4.0 permits redistribution and adaptation, commercial use included, with credit, the
licence link and a change notice. Those are in the app: the "Settings & model library"
overlay (`DownloadCenter.tsx:85-96`) and a credit line with a licence link in each lab. The
listing carries the credit too. Still open:

- [ ] Owner review of the final attribution and legal posture. This record comes from the
      owner's notes and was not re-checked against Sketchfab; re-check both pages at submission.
- [ ] The seven `bocal-*-cinematic.webp` images on the instrument picker have no recorded
      source or licence. The repo calls them generated visual masters, so the question is the
      generator's terms, not a photo licence. Do not use them in store graphics.
- [ ] Notices are incomplete: `android/THIRD_PARTY_NOTICES.md` ("Bocal Android 0.6") lists
      only the two models and Three.js and describes a deleted module tree;
      `web-source/THIRD_PARTY_NOTICES.md` lists only Hyle. React, react-dom, lucide-react and
      the inlined Geist fonts (`preview-fonts.css`) have no notice, and nothing in-app shows
      them.

## WebView requirement

`minSdk` is 26 (Android 8.0), but Bocal also needs **Android System WebView 69 or newer**
(`MIN_WEBVIEW_MAJOR` in `WebViewFloor.kt`, matching the bundle's `chrome69` build target).
On an older or missing WebView the shell does not create a WebView; it shows a native
"Bocal needs a newer WebView" screen with Update WebView and Try again buttons
(`WebViewUpdateScreen.kt`). Update WebView opens Google Play for `com.google.android.webview`,
so it is wrong where the provider is a different package.

CI never shows that screen (both emulators, API 26 with Chrome 69 and API 35, meet the floor).
The floor is proven for script parsing only: `globals.css` also uses `100dvh`, `inset` and
`aspect-ratio`, which `check-bundle-syntax.mjs` does not cover. Worth a line in support copy.

## Deltas from the house defaults

### App access
All functionality is available without special access. There is no account or login.

### Data safety
**No data collected. No data shared.** This follows from Google's definitions
(help answer 10787469, fetched 2026-11-04): "collect" means transmitting data off the
device, and data "only processed locally on the user's device and not sent off device" does
not need to be disclosed. Microphone audio and recorded takes are held in the app's private
storage and never transmitted, so no audio data type is declared.

`HOUSE_DEFAULTS.md` sections 2 and 3.8 say the form "still asks" about on-device data and
that every network call is HTTPS. Neither applies here: Bocal makes no network call, and the
encryption and deletion questions belong to the collected-data branch, so they are not asked.
Do not paste "Encrypted in transit: Yes" or "Users can delete data in the app".

The answer holds only while:

1. The release AAB has no `INTERNET` (and no `AD_ID`). Confirm on the signed bundle.
2. The `beta` build type never reaches the `com.bocal.music` track.
3. Nothing is ever transmitted: update this answer and the policy together if anything is.

What can leave the device, none of it Bocal transmitting: a credit or source link opens in
the system browser (sketchfab.com, creativecommons.org, cgtrader.com, yamaha.com, legere.com);
the Update WebView screen opens Google Play; Save As writes to a location the user picks
(possibly a cloud-backed provider); the transcription share may open a share sheet. All are
user-initiated. Android System WebView is a system component with its own settings; the
app adds no telemetry. The policy says all of this.

Recording is explicit and local: **audio is analysed in real time on the device. Recording
starts only when the user presses Record take on the Analyze screen or the Vocal stage;
imported audio files are copied into the same library. Takes (at most 12, up to 10 minutes
each) are stored in the app's private IndexedDB, can be deleted one at a time, and are never
transmitted.** A take in progress is stopped and saved when the user leaves the screen, and
a take is session-only if storage fails.

### Permissions
| Permission | Why | Play form? |
|---|---|---|
| `RECORD_AUDIO` | Pitch and tone detection. The core function. | No declaration form. |
| `VIBRATE` | The optional "Feel the beat" metronome switch, off by default. Nothing else vibrates. | No |

The manifest also has `uses-feature android.hardware.microphone required=false`. The
release manifest has no `INTERNET`, storage, notification, foreground-service or
`WAKE_LOCK` permission; `androidx.core` is expected to merge a signature-level
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (confirm on a build). The only exported component
is `MainActivity` (launcher only). The shell grants audio capture only to the bundled origin,
never video, and only when `RECORD_AUDIO` is held.

**Rationale.** Google's prominent-disclosure rule applies where handling "may not be within
the reasonable expectation of the user", and it asks for an in-app disclosure, not strictly
a pre-prompt. The shell shows none before the system prompt (the old sheet said one "must"
appear; it does not exist). A tuner whose button says "Start live tuner" arguably meets the
expectation, but add one sentence next to the first mic control, for example: "Bocal uses
your microphone to hear your pitch. Audio is analysed on this device and kept only if you
tap Record."

### Target API
`targetSdk 37` is above Google's floor: new apps and updates must target API 36 from
2026-08-31 (help answer 11926878, fetched 2026-11-04; the 1 November extension has lapsed).
That AGP 9.3.0, Gradle 9.7.1 and compileSdk 37 produce a valid AAB is known only from one
green run at `ba04faf` (versionCode 7); nothing has built a signed bundle since. The one
native library is `libandroidx.graphics.path.so`; nothing checks its 16 KB alignment.

### Content rating
- Category `Utility, Productivity, Communication, or Other` (or the educational one).
- Every question **No**: no user-to-user exchange, purchases, location, or open browsing.
  Record the certificate IARC returns rather than predicting a rating.

### Target audience
**18 and over only** (the house default). Ticking the minors-restriction box would block
teen students, so leave it unticked. Do not tick under-18 groups without reading the Families
policy: Google says 13-15 and 16-17 "may be considered to include children in some locales".
Avoid youthful imagery in the listing.

### Other App content
Ads **No**. Advertising ID **No** (confirm no `AD_ID` on the signed bundle). News, COVID,
government, financial **No**. Health **No**: the Vocal stage states it is not a vocal-health
measure. AI-generated content: not applicable; there is no generative feature (Coach mode is
a manual coach-and-student planner, transcription is pitch DSP, and the skill rating is a
fixed formula).

### Monetisation
No in-app purchases and no billing dependency.

### Minimum functionality
Google's spam and functionality pages target apps whose purpose is "a webview of a website".
Bocal loads no website: it serves a bundled file from a virtual origin and adds native
bridges (Save As, keep-awake, theme, microphone mediation). Neither page addresses bundled
local assets, so how a reviewer treats this cannot be settled from published text.

## F-Droid

Not possible today. No `LICENSE` file covers `android/` or `web-source/` (only
`web-standalone/LICENSE-CODE.md`, MIT, for the legacy variant, and `models/LICENSE-ASSETS.md`
for the non-shipping in-house models), so the code is all rights reserved. Draft PR #21
would add **PolyForm Noncommercial 1.0.0**, which is not an OSI or F-Droid free-software
licence and would also make "open source" wording false. Choose a licence before any F-Droid
work, and record the provenance of the cinematic images. The two CC BY 4.0 models are not a
non-free-asset problem.

## Listing gate

`HOUSE_DEFAULTS.md` 4.3 rule 4 says never claim behaviour that is not device-verified. No
physical-device acceptance is recorded, so the copy in `android/fastlane/` is drafted and
ready, not cleared. Do not upload until the matching check is run on a phone, or cut the
sentence.

| Listing claim | Cleared by |
|---|---|
| Pitch from the microphone; stops on background; no restart needed after the first grant | `DEVICE_TEST_PLAN.md` "Audio and lifecycle" (and blocker table row 1) |
| Saxophone fingering trainer and chart | "Sax detailed Lab" |
| Oboe 3D model and part names | "Howarth S20C oboe" |
| Light and dark themes, readable at large font | "Accessibility" |
| Record take, import, tags, compare, delete, Save As, survive a restart | **no row. Add one** (also exercises `window.confirm`, row 4) |
| Vocal stage, harmonicas, guitar, transcription, metronome, tone generator, repeat-after-me drill | **no row. Add one or cut the sentences** |
| "Does not ask for the internet permission" | `apkanalyzer` on the signed AAB |

## Pre-submit checklist

- [ ] Decide the title, category and versionName (and rename the changelog if versionCode changes)
- [ ] Choose a licence; decide on PR #21
- [ ] Fix `verify-aab.sh` (drop `-strict`, or accept the self-signed chain), restore the tag, payload-identity and checksum gates in `release.yml`, add the Playwright install step
- [ ] Set the four `BOCAL_UPLOAD_*` secrets (`base64 -w0`), run `release.yml` once via `workflow_dispatch`, and record the run ID, AAB SHA-256 and signing fingerprint
- [ ] Run `apkanalyzer` on the signed AAB: no `INTERNET`, no `AD_ID`; check R8 output, prompts and models present, 16 KB alignment
- [ ] Run `DEVICE_TEST_PLAN.md` on a phone, especially the first microphone grant and denial; add rows for takes and the other instruments
- [ ] Add an in-app privacy-policy link or text, and one sentence before the first mic request
- [ ] Hide the handoff download, the "release promotion is pending" banner and the sourcing list in the Play build; route the Coach brief through Save As
- [ ] Correct the in-app "browser", "Nothing leaves your device" and "checked on alto" copy
- [ ] Owner review of attribution; record where the cinematic images came from; add React, lucide-react and Geist notices
- [ ] Renew or retire the dependency-audit allowlist entry before 2026-12-27
- [ ] Make the 512 px icon and 1024x500 feature graphic; take 2 to 8 screenshots on a device
- [ ] Publish `privacy-policy.md` at the privacy URL; confirm 200 and that the alias delivers
- [ ] Confirm account type and closed-test needs; re-check Google's target-API rule and the live Data safety wording at submit time

## Stale elsewhere (not changed here)

This repo: `README.md:24`, `android/APK_BUILD_STATUS.md`, `android/MODEL_MANIFEST.md` and
`android/THIRD_PARTY_NOTICES.md` still say 0.6.0 / versionCode 7; `android/README.md` says
`saveFile` writes to MediaStore Downloads (it uses the Save As picker) and no longer has a
WebView-floor section; `docs/BOCAL_HANDOFF.md` says the models ship under `assets/www/models`
(they are inlined in `app.html`); `android/DEVICE_TEST_PLAN.md` omits the Vocal stage and other
mic entry points.
`Personal-Tracker`: `store/HOUSE_DEFAULTS.md` 2, 3.8 (on-device data "still asked about";
"every network call is HTTPS"; "uninstall removes everything", false for exported files).
