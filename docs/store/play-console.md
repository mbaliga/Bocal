# Bocal — Play Console answer sheet

> Only the **deltas** from `Personal-Tracker/store/HOUSE_DEFAULTS.md`. Metadata is
> under `android/fastlane/...` because the Android app is one target in a
> multi-surface repo (web standalone, two Next.js variants, models, research).

| | |
|---|---|
| applicationId | `com.bocal.music` |
| Version at time of writing | `0.5.0` (versionCode `6`) |
| Category | **Education** (Music & Audio is defensible; Education matches what it is for) |
| Tags | saxophone, woodwind, tuner, music practice, intonation, 3d |
| Contact email | `bocal@asystemofcells.com` |
| Website | `https://asystemofcells.com/bocal` |
| Privacy policy | `https://asystemofcells.com/bocal/privacy` |

> **Status:** the repo is explicit that this is "a snapshot of prototype work, not a
> released product" and that two of the four source trees have diverged. Decide
> which surface is canonical before shipping; the listing describes the Android app
> (`android/`, 0.5.0).

## Model licensing (resolved for the current bundle)

> **6 September update:** this section originally described a three-model bundle
> (alto sax, oboe, clarinet) and flagged the clarinet's CC-BY-NC licence as a
> blocker. The clarinet model has since been removed; `android/app/src/main/assets/www/models`
> now ships only `oboe/` and `sax/`, both CC-BY-4.0, and `android/MODEL_MANIFEST.md`
> records the reversal. The steps below are kept for future model additions.

The Android app ships **two third-party glTF instruments** (alto sax, oboe), both
CC-BY-4.0.

**Confirm, per model, that the licence permits commercial redistribution inside a
closed-source app on a store.** Many free 3D models are CC-BY (attribution required
and must be visible), CC-BY-NC (no commercial use, which includes a store listing
whether or not the app is free), or CC-BY-ND (no derivatives, which can rule out
re-exporting or re-rigging). This is the highest-risk item for this listing, higher
than any Play form, because it is a copyright question rather than a policy one.

Three outcomes, and they are all fine:
1. Licences permit it: add the required attributions to an in-app credits screen and
   ship.
2. They do not: swap in models from `models/`, the repo's own 35 original
   educational woodwind GLBs, which have no third-party licence problem.
3. Uncertain: treat as (2). Do not ship a model whose licence you cannot cite.

If **any** model requires attribution, an in-app credits screen naming each model,
author and licence is required. Put it in Settings, and do not rely on the store
description for it.

## Deltas from the house defaults

### Data safety
**No data collected. No data shared.**

| Question | Answer |
|---|---|
| Collect or share any user data? | **No** |
| Encrypted in transit? | Yes |
| Deletion? | Users can delete data in the app |

The claim that matters: **audio is analysed in real time on the device and is never
recorded or transmitted.** Play treats microphone access seriously, and a music app
that records is a different Data safety answer from one that only listens. Make
sure the code matches: if any buffer is written to disk beyond the analysis window,
say so.

### Permissions
| Permission | Why | Play form? |
|---|---|---|
| `RECORD_AUDIO` | Pitch and tone detection. The core function. | No form, but a clear in-app rationale must appear before the first request. |
| `VIBRATE` | Metronome and interaction feedback. | No |

### targetSdk
Resolved: `android/app/build.gradle.kts` targets and compiles against `37`.

### Content rating
- Category `Utility, Productivity, Communication, or Other`, or `Reference, News,
  or Educational` given the category. Either yields **Everyone** here.
- Everything else No.

### Monetisation
- **No in-app purchases** today.

## F-Droid
- Re-evaluate: the remaining bundled assets (alto sax and oboe models, CC-BY-4.0;
  the WebView shell's own code) carry no non-free licence, so the earlier
  `NonFreeAssets` concern (written for the since-removed CC-BY-NC clarinet model)
  no longer applies as stated. Still confirm there is no other non-free dependency
  before submitting.

## Pre-submit checklist

- [ ] **Audit every bundled glTF model's licence**, and record the finding in
      `docs/`. This gates everything else.
- [ ] Add an in-app credits screen if any model requires attribution.
- [ ] Decide which source tree is canonical for the Android app.
- [ ] Confirm audio is never written to disk outside the analysis window.
- [ ] Screenshots: the 3D instrument lab, the tuner mid-note, a practice workflow.
