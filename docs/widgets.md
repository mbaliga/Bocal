# Home-screen widgets (Android)

Bocal's Android shell ships six standard home-screen App Widgets (`AppWidgetProvider` + `RemoteViews`),
so any launcher can host them: Pixel Launcher, One UI, Nova, Orrery Home and the rest. Each one resizes
across three layouts (small, medium, large) and draws only Bocal's real practice data. None of this has
been seen on a phone yet: everything below that depends on a launcher is in the owner-verify list at the end.

## How the data reaches a widget

Practice data lives in the WebView's `localStorage` (keys in `web-source/app/storage-keys.ts` and
`practice-data.ts`), which native code cannot read. So the page publishes a summary through one bridge
method, and the shell keeps it:

1. `web-source/app/widget-snapshot.ts` builds the summary (`buildWidgetSnapshot`, pure and node-tested)
   and `useWidgetSnapshotPublisher` (mounted in `page.tsx`) sends it with
   `window.bocalHost.publishWidgetSnapshot(json)`:
   - after any `bocal-practice-activity`, `bocal-song-wishlist`, `bocal-weekly-goal` (new, fired by the
     Practice goal picker) or `bocal-sessions` (new, fired when the header's session timer stores a run)
     event, coalesced over 300 ms;
   - when the instrument, A4 or temperament changes;
   - at once on `bocal:host-pause`, so the "as of" time is the moment Bocal was left;
   - once when the page loads. In a browser there is no bridge and nothing is sent.
2. `BocalHost.publishWidgetSnapshot` (Kotlin) hands it to `BocalWidgets.publish`, which validates it with
   `WidgetSnapshotParser` (a strict reader, `MiniJson`, since the app has no JSON library and
   `org.json` is a stub in JVM tests), writes it atomically to
   `noBackupFilesDir/widgets/snapshot.json`, and redraws every placed widget on a background thread.
   Anything off-spec (another schema version, a duplicate day, an out-of-range number, more than 64 KB) is
   refused, `false` goes back to the page, and the widgets keep the last good summary.

The summary (schema version 1) holds: `publishedAt`; the weekly goal; per-day seconds for today and the six
days before it (all activity, Pulse activity, and the session timer, kept apart as the app keeps them);
the five newest practice-log rows as **type, length and time only**; when Pulse was last logged; the
instrument's name, family, pitch, written offset, lab label and lab status (from `instruments.ts`) and its
chart's own review badge (from `fingering-charts/`); A4 and the temperament's name; up to three songs marked
Studying (title and marked progress) with Studying and wishlist counts.

Never sent: activity labels and notes (a player can type or rename them), lesson notes, the coach plan,
takes, the equipment log, vocal range or melodies, the skill rating, the streak.

Minutes go per day rather than as one total, so a widget recomputes "the last seven days" on the day it is
drawn: looked at on Friday after Bocal was last opened on Monday, it shows Friday's window, with nothing
logged since. That is the truth, because practice is only logged inside Bocal.

### How the web code gets into the APK

`android/app/src/main/assets/www/app.html` is not committed (`.gitignore`). Gradle's `stageWebApp` task
(wired into `preBuild`) runs `npm run preview:standalone` in `web-source/` and copies
`preview-dist/index.html` in; CI builds the same file in its `web` job and stages it before Gradle
(`BOCAL_SKIP_WEB_BUILD=1`). So every APK built from this tree carries the page that calls the bridge; there
is no stale committed bundle to rebuild. The 2026-11-04 local build was checked by searching the staged
`app.html` and the debug APK's copy for `publishWidgetSnapshot` and `takeOpenRequest`.

## The widgets

| Widget (provider) | Template | Small (about 2x1 / 2x2) | Medium (about 4x2) | Large (about 4x3+) | A tap opens |
|---|---|---|---|---|---|
| **This week** (`ThisWeekWidget`, default 4x2) | progress | "42 / 60 min", bar, and "This week" or "✓ Goal met" | big minutes, "of 60 min", bar, "70% of your goal · 4 active days", as-of line | adds a seven-day bar chart (day initials; screen readers get every day's minutes) and the session-timer minutes | Practice |
| **Tune** (`TuneWidget`, default 2x2) | card | instrument short name, "A4 442 Hz" | name, "A4 = 442 Hz · Equal temperament", transposition ("E♭ instrument · written 9 semitones above concert" or "Concert pitch") | adds a note that the microphone starts only when you press Start live tuner, and pads: Tuner, Tone, and the lab (named Lab, Chart, Vocal or Strings) | the tuner |
| **Now studying** (`NowStudyingWidget`, default 4x2) | card / list | newest Studying song ("Song title hidden" until shown), bar, "40% marked" | adds the eye toggle (shows or withholds titles on this widget) and "+N more studying" | up to three Studying songs with their bars, the more-studying and wishlist counts, and an as-of line | your songs in Practice |
| **Practice log** (`PracticeLogWidget`, default 4x3) | list | newest row: "Tune · 12 min" and its time | three rows (type, length, time today or the date) | five rows, then "On this phone · As of …" | the practice log |
| **Pulse** (`PulseWidget`, default 4x2) | pads | one tap target, "Metronome", "Last 7 days: 24 min" | Pulse minutes over the last seven days, an as-of line, pads: Metronome, Sequences | adds the last Pulse session and pads: Drone, Tuner | the metronome (each pad its own section) |
| **Instrument** (`InstrumentWidget`, default 4x2) | card | name, and "◇ Not teacher-reviewed" when its chart carries a badge (else the lab's name) | family, name, the chart's own badge in full right under the name (e.g. "◇ Method-book consensus, not yet teacher-reviewed"), then the "Lab: …" status on one line | adds the transposition and pads: the lab, Tuner | the lab |

Sizes: `SizeClass` in `WidgetModels.kt`. A layout applies from its minimum: small from 40 x 40 dp, medium
from 200 x 140 dp, large from 250 x 210 dp. Those heights are the natural heights of the tallest layout of
each class at font scale 1.0 (12 dp padding, 12/14/16/28 sp text, 48 dp pads), so a layout is only picked
where it fits. With the platform's reference cell sizes that means: one row of any width (about 102 dp in
portrait) and 4x2 in landscape (about 557 x 117 dp) get the small summary; 3x2 in portrait and 4x3 in
landscape (about 557 x 184 dp) get medium; 4x2 in portrait (about 276 x 220 dp) and taller get large.
On Android 12+ the widget hands the launcher all three (`RemoteViews(Map<SizeF, RemoteViews>)`), so
resizing never wakes Bocal. Below 12 it draws one layout per orientation from the reported options
(portrait `MIN_WIDTH` x `MAX_HEIGHT`, landscape `MAX_WIDTH` x `MIN_HEIGHT`), combines them with
`RemoteViews(landscape, portrait)` so the launcher swaps them as the phone turns, and redraws in
`onAppWidgetOptionsChanged`. A launcher that reports no size gets the layout that fits the provider's
declared `minWidth` x `minHeight` (`WidgetModels.declaredMinSize`, which a test checks against the XML).
Small layouts are one tap target with no extra controls. Lists use fixed rows hidden when unused (no
`RemoteViewsService`).

Inside the medium and large layouts the lines the house rules protect (the review badge, the as-of and stale
lines) are fixed in place, and optional detail (the goal caption, the log rows, the last Pulse session, the
transposition, the lab status) takes the spare height. At a large font scale the optional detail is what
gets cut, never the badge or the as-of line.

Layouts: `res/layout/widget_<name>_{small,medium,large,preview}.xml`, `widget_message.xml` (first-run and
error states) and `widget_loading.xml` (`initialLayout`). Definitions: `res/xml/widget_<name>_info.xml`
(`updatePeriodMillis="0"`, `previewLayout` on 12+, a vector `previewImage` below).

## States

- **First run**: no summary yet. "Open Bocal once: your practice shows here after Bocal has been opened on
  this phone."
- **Can't read**: the stored file is damaged. "△ Can't read practice data … Open Bocal to refresh it."
- **Empty**: "Nothing logged yet …" (log), "No song in the shed" or "Nothing marked Studying · 3 on your
  wishlist" (Now studying), "No Pulse session logged yet" (Pulse), "—" for a day or week with no minutes.
- **As of / stale**: Bocal only publishes while it runs. This week, Practice log, Pulse (medium and large)
  and Now studying (large) print "As of 3:45 PM" (or the date); after 24 hours it becomes "◷ Last updated
  Nov 2 · open Bocal to refresh". Where a size has no room for an as-of line (small This week, small Pulse,
  small and medium Now studying) the stale line replaces that size's meta line once the summary is over a
  day old. Tune and Instrument show settings, not a running count, and print no as-of line.
- **Withheld** (the default for song titles): a Now studying widget shows "Song title hidden" in place of
  every title, with progress and counts, until the user taps its eye (medium and large) to show titles on
  that one widget. A small widget has no eye and follows the same per-widget setting, so it never shows a
  title the user has not asked to see.

## Refreshing

Pushed, never polled (`updatePeriodMillis="0"`):

- every accepted publish from the page redraws all placed widgets;
- the launcher's own update, resize and option changes redraw that widget (`goAsync` plus one background
  thread, `BocalWidgets.runAsync`);
- `TIME_SET`, `TIMEZONE_CHANGED` and `LOCALE_CHANGED` redraw dates and words;
- one inexact, non-waking alarm (`AlarmManager.set(RTC, …)`) at the earlier of a minute after local
  midnight (when "the last seven days" and the as-of wording move on) and a minute after the stored
  summary turns 24 hours old (when the stale line must appear): `WidgetModels.nextRedraw`. It is re-armed on
  each redraw and cancelled when no Bocal widget is placed. No exact-alarm permission, no WorkManager, no new
  permission at all.

## Taps

Every tap is a `PendingIntent.getActivity` for the explicit `MainActivity` with the extra
`com.bocal.music.extra.OPEN` naming one allow-listed destination (`WidgetDestination`), `FLAG_IMMUTABLE`, and a
request code unique per widget and slot. No URL scheme. `MainActivity` hands the destination to
`HostOpenRequests`; the page takes it once with `bocalHost.takeOpenRequest()` on load and after a
`bocal:host-open` event (sent when Bocal was already open), checks it against its own list
(`HOST_DESTINATIONS` in `widget-snapshot.ts`) and switches workspace, scrolling to the section
(`ctx-practice-log`, `ctx-practice-songs`, `ctx-pulse-drone` and so on). Anything off the list is ignored on
both sides. The tuner opens but does not start listening; the microphone needs the in-app button, as before.

The eye toggle is the only control that changes state: an immutable broadcast to the non-exported
`WidgetActionReceiver`, which checks the id belongs to a Now studying widget, flips its setting
(`noBackupFilesDir/widgets/shown-titles.txt`, the ids of widgets told to show titles; any other widget, or
an unreadable file, withholds them) and redraws it. Removing the widget forgets the setting.

## Privacy and house rules

- A home screen is a public surface. Practice minutes, the instrument and A4 are fine to show; activity
  labels and notes never leave the page. Song titles are text the player typed, so every Now studying
  widget withholds them ("Song title hidden", with progress and counts) until the user taps that widget's
  eye; the choice is per widget and forgotten when the widget is removed (the guide's "never show input
  text by default", the strategy's `sensitive` class). Titles are cleaned (no control or direction-override
  characters) and wrapped in Unicode isolates.
- No streak on any widget (the in-app card keeps its own). No badges, no unread counts, no nudges.
- The "not teacher-reviewed" badge is never dropped: the Instrument widget prints the chart's own badge
  text right under the instrument's name (up to three lines), shortened only at the smallest size, and
  TalkBack reads it at every size.
- Colour never carries meaning: violet is the only accent, and every state has a word and a shape (✓ goal
  met, ◇ review badge, ◷ stale, △ error, eye / crossed eye). Day and night colours come from Bocal's own
  palette (`values/widget_colors.xml`, `values-night/`).
- No network in any widget; the manifest gains no permission (still `RECORD_AUDIO` and `VIBRATE` only, no
  `INTERNET` outside the beta build); no new dependency. Widget files live under `noBackupFilesDir` and the
  app keeps `allowBackup="false"`.
- Providers are exported (a launcher must bind them); `WidgetActionReceiver` is not.
- Text is in sp with `maxLines` and ellipsis; pads and the eye toggle are at least 48 dp; layouts use
  start/end; every pad and the eye toggle has a content description.
- Screen readers: the whole-widget tap target (`@android:id/background`) carries no content description of
  its own, so TalkBack reads the lines actually drawn inside it, in order: the review badge, the as-of and
  stale lines, each log row ("Tune, 12 min, 9:40 AM"), each song or "Song title hidden". Two views add
  spoken wording: the small This week value ("42 of 60 minutes" for "42 / 60 min") and the large chart (every
  day's minutes; its bars and day initials are hidden from TalkBack).

## Tests

- `android/app/src/test/java/com/bocal/music/widget/` (plain JVM, no Robolectric):
  `MiniJsonTest`, `WidgetSnapshotParserTest`, `WidgetTextTest`, `WidgetModelsTest` (size classes at the
  platform's reference cell sizes, the per-orientation pick below Android 12, the default size checked
  against each provider's XML through `ProviderXml`, the seven-day window and goal percentage, day bars,
  Pulse minutes, freshness, list and song selection, request codes, transposition, the next redraw at
  midnight or at the stale boundary), `WidgetSnapshotStoreTest` (atomic write, refusal, damaged file,
  titles withheld by default and per widget) and `HostOpenRequestsTest`.
- `web-source/tests/widget-snapshot.test.mjs`: the builder (window, buckets, no labels or notes, song order
  and cleaning, review badges, goal parsing), the destination allow-list against the app's real section ids
  and against `WidgetDestination.kt`, and the shared contract fixture
  `android/app/src/test/resources/widget-snapshot-v1.json`, which the builder must reproduce and the Kotlin
  parser must read. Regenerate it from `tests/fixtures/widget-snapshot-input.mjs` if the format changes.
- `web-source/tests/widget-bridge-e2e.mjs` (part of `npm run test:e2e`): in Chromium, with a stand-in
  `window.bocalHost`, the page publishes on load, on a weekly-goal change and at once on host pause, never
  sends a label or note, opens a widget's destination on a cold start and while running, and ignores one
  that is not on the list. It does not exercise the real Android bridge.
- `android/static-check.sh` checks every provider is registered with its definition and the action
  receiver is not exported; `tests/release-downloads.test.mjs` pins the two new bridge methods.

## Owner-verify (needs a phone)

- [ ] Each widget appears in the picker with its preview (Android 12+) or preview image (older), on the
      owner's phone and launcher, Pixel Launcher, One UI, Nova and Orrery Home.
- [ ] Resizing each widget moves between the small, medium and large layouts with nothing clipped, at
      font scale 1.0, 1.3 and 2.0, in light and dark mode.
- [ ] After opening Bocal and logging a tuner or metronome session, This week, Practice log and Pulse
      update without opening the launcher's widget settings.
- [ ] Each tap and pad lands on the right workspace and section, both from a cold start and with Bocal
      already open; the tuner does not start listening by itself.
- [ ] A newly placed Now studying widget shows "Song title hidden"; its eye shows and then hides titles
      on that one widget only, and a small widget follows what its eye was last set to.
- [ ] Just after midnight the seven-day window moves on, and a day after Bocal was last opened the stale
      line appears (best effort: Doze and OEM battery managers may delay the inexact alarm; Android 15 greys
      a widget out after a force-stop until Bocal is opened).
- [ ] TalkBack, focusing a widget, reads the lines drawn in it: the Instrument badge, the as-of or stale
      line, each Practice log row, each song or "Song title hidden", the chart's per-day minutes; then each
      pad and the eye by name.
- [ ] A one-row widget shows the small summary; a 4x2 widget shows the large layout upright and the small
      one on its side (and on Android 8–11 swaps them when the phone turns) with nothing clipped.
- [ ] The day bars fill upwards as drawn (a vertical `clip` progress drawable inside a `RemoteViews`
      progress bar) on the owner's launcher.
