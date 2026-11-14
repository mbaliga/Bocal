# Audit High findings: brief

Source: the full audit of 14 Nov 2026 (five reviews: UX, code, security, accessibility and performance, music and honesty). It found 0 critical and 14 High findings. This note says what we intended, what is done, and what is pending.

## What we intended

Clear every High finding that can be fixed safely in one pass, with a test for each fix, and list the rest with the reason they were not done. The standing rule applied: plan with the larger model, implement with the smaller one, run the full gate list before merging.

## Done

| # | Finding | What changed |
|---|---|---|
| C1 | Critical React Server Components advisory live on main | React, react-dom and react-server-dom-webpack to 19.3.1 (merged in PR 33). React 19.3 calls `Promise.allSettled` unguarded, so the standalone page defines it in a head script for the Chrome 69 floor and `check-bundle-syntax` requires the shim. The dependency audit gate is green. |
| C2 | Store listing says audio is not recorded | Listing, short description, title, changelog, privacy policy and Play Console sheet now state that takes are recorded when you press Record and stay on the device. Text taken from PR 28. The launcher and store icons from that PR were left out so the owner's logo icons stay. |
| A1 | First onboarding step looks broken | The picker's deck layout is now shared with onboarding. Each deck has its own heading and the stored instrument is selected and scrolled into view. Test at 412x915 added. |
| A2 | "Start live tuner" below the fold on phones | A 44 px "Start tuner" button sits at the top of the tuner card on narrow or short screens. Test at 412x915 and 360x740 added. |
| D1 | Dialogs not modal | One shared hook (`useModalFocus`): focus moves in, Tab is trapped, everything behind is `inert`, focus returns to the opener, Escape still closes. Applied to the picker, onboarding, settings and keyboard help. New `tests/dialog-focus.mjs` is part of `test:e2e`. |
| D2 | Light-theme Coach fields unreadable | Coach inputs use the light field colours. The theme test now also checks typed-value and placeholder contrast, and it found two more bad fields (song wishlist, lesson note) which are fixed. Now 206 states, 0 failures. |
| E1 | Bass voices below E2 not heard | Vocal floor 80 to 60 Hz, guitar floor 75 to 65 Hz (Drop D). Tests for C2, D2, E-flat2, E2 at 44.1 and 48 kHz. |
| E2 | Play-along marks vibrato as "not yet" | Each note is scored against the average pitch over about 200 ms, not raw frames. Centred vibrato of 20 cents now passes Standard, 30 cents passes Lenient. A note 20 cents sharp still fails Standard. |
| B3 | Half-removed dock pill | No longer applies. The arc and pill were restored in PR 33, so that code is live again. |

Gates run on the merged branch: 560 unit tests, typecheck, lint, build, standalone bundle with syntax check, 43 browser scenarios, 28 navigation checks, 80 tap-target screens, dialog focus test, theme (206 states), production smoke, reliability, phone landscape.

## Pending

| # | Finding | Why it is not done | Next step |
|---|---|---|---|
| E1 (part) | A D2 made only of partials 2, 4 and 6 still reads an octave high | The signal is identical to a real D3, so the detector cannot tell. | Needs a voice-aware range check. Real voices do have a fundamental, so this is a synthetic edge case. |
| C3 | No root LICENSE, conflicting licence texts | Owner decision. | Choose PolyForm Noncommercial (PR 21), MIT, or none. |
| D3 | Text sized in px, 38% at 9 px or less | 2 to 4 days of work with a visual review of every screen. | Convert to rem with an 11 px floor in a separate PR. |
| B1 | Tests mostly grep source text | Ongoing work, not one fix. | Every fix above adds behaviour tests. Add a musical fixture test for fingering charts next. |
| B2 | Very large components (PulseView 42 useState, ToneGenerator 28) | Risky refactor, needs its own plan and tests first. | Split Pulse first. |
| B4 | 60% of the bundle is embedded 3D models | Build change, 1 to 2 days, needs a device to measure. | Load models as separate files on the web build; keep inlining for Android. |
| Release | Signed release blocked | `BOCAL_UPLOAD_KEY_ALIAS` secret is wrong. | Owner runs `keytool -list` on the keystore, fixes the secret, then re-run the release workflow. |
| PR 28 | Open | Its text is now in this branch. | Close it after this merges. |

Not covered by any fix: real microphone behaviour, real GPU timings, screen readers, notched-device safe areas, physical-device audio, teacher review of charts.
