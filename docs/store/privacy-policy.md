# Privacy Policy — Bocal

> **This is the working copy, not the hosted one.** The URL Play Console points at
> is **https://asystemofcells.com/bocal/privacy**. Keep the two in sync by hand.
> It describes the Play build (the `release` variant of `main` @ `f10ed32`), read on
> 2026-11-04. Re-check it against the signed bundle you publish, and against
> `play-console.md`: the Data safety answers must agree with this page.

**Last updated: 4 November 2026**

Bocal is a music practice app for woodwinds, harmonica, guitar and vocals (package
`com.bocal.music`), made by A System of Cells. It listens to you play or sing, so this policy
is specific about what happens to that audio.

## The short version

Bocal has no accounts, no advertising, no analytics and no tracking, and the app does not ask
for the internet permission. **Your playing is analysed in real time on your device and is
never uploaded.** If you choose to record a take, it stays on your device unless you export it
yourself.

## The microphone

Bocal listens through your microphone to detect pitch and analyse your tone. That is how a
tuner works, and it is the core function of the app.

- Audio is processed **as it arrives**, on your device. The tuner and the live analysis views
  keep no audio. When a tuner session ends (you stop it, leave the Tune screen or switch apps)
  and the tuner has locked onto at least 15 pitch readings (about half a second of steady
  sound), Bocal saves a short summary on your device: the date and time, how long the tuner was
  listening, which notes were detected, and overall figures for how far from pitch you were. It
  is used for your practice history and skill rating.
- **Recording starts only when you press Record take**, on the Analyze screen (after Start
  analysis) or the Vocal screen. On the Analyze screen you can also import an audio file you
  choose (under 32 MiB); it is copied into the same library. The Transcribe panel can read an
  audio file you choose too; that is analysed on your device and is not saved. A recorded take
  stops when you press Finish take (or Stop analysis on the Analyze screen), after 10 minutes
  (or at the recording size limit), if the
  microphone is interrupted, or if you leave the screen or switch apps, and what was recorded
  so far is kept. The library holds up to 12 takes, and Bocal never deletes a take on its
  own.
- Takes are saved in the app's private storage on your device (the browser storage inside the
  app, IndexedDB), so they survive closing the app. If that storage fails, a take is kept only
  while you stay on that screen, and the app tells you to export it before you leave.
- You can rename, export (the Analyze screen calls this Download) and delete the takes Bocal
  lists, and add tags and notes to them on the Analyze screen. Deleting asks you to confirm.
  Uninstalling Bocal removes them. A file you export goes where you choose and is not removed
  by uninstalling.
- Bocal stops listening when you leave the app, and does not start again until you ask.
  You can revoke the microphone permission at any time in Android's settings.

## What else is stored, and where

In the app's private storage on your device: your settings and preferences, your practice log
and weekly goal, saved practice-session times and lengths, your practice checklist ticks, the
tuning summaries above, the results of fingering checks and rhythm taps (the figures your skill
rating is calculated from), a lesson note, a coach plan (names, focus, assignment and check-in
date) if you type one, song titles you add, equipment notes, saved exercises, melodies,
metronome presets and sequences, your vocal range, and your takes with their tags and notes.
Some lists keep only the most recent entries and drop the oldest once full.

Bocal does not add any encryption of its own to this data. It is protected only by Android's
app sandbox and, on devices where it is switched on, Android's device storage encryption.
The app turns off Android's cloud backup, so Android Auto Backup does not copy this data to
your Google account. It does not configure Android's phone-to-phone transfer, and on
some devices that transfer can still carry app data to a new phone.

**Keeping and deleting.** You can delete individual takes, practice-log entries, saved
exercises, melodies, metronome presets and sequences, equipment notes, and clear your vocal
range, inside the app. There is no delete-all button, and some items cannot be removed in the
app: the lesson note and the coach plan (you can only overwrite them), song titles, saved
sessions, and the saved tuning summaries, fingering checks and rhythm-tap results that the
skill rating is calculated from (deleting a practice-log entry does not remove them). A saved
take that the app cannot read is not listed and cannot be deleted in the app. Removing
everything is done with Android's Clear storage for Bocal, or by uninstalling. Neither removes
files you exported.

## What is sent off your device, and to whom

**Nothing, by Bocal.** The app has no internet permission, loads nothing from the web, and
contains no analytics or advertising code.

A few things you tap hand over to another app, which then has its own policy:

- A credit or source link opens in your browser or another app (the sites linked are
  sketchfab.com, creativecommons.org, cgtrader.com, yamaha.com and legere.com).
- If your Android System WebView is too old or cannot be read, Bocal shows a screen whose
  Update WebView button opens the Google Play page for Android System WebView (in the Play
  Store app, or in your browser if that app is missing).
- The buttons that save a file (Export on Vocal takes, MIDI, MusicXML and your own exercises,
  Download on Analyze takes, and Share my progress) open Android's own save-file screen, and
  Share the notes may open a share sheet instead, so you pick where a file goes. That can be
  a cloud-backed folder, in which case that service handles the file.

Android System WebView, which runs the app's screens, is a part of Android with its own
settings and policies. Bocal adds nothing to it.

## Permissions, and why each exists

| Permission | Why |
|---|---|
| `RECORD_AUDIO` | To hear the note you play or sing, so the app can show your pitch and tone. Analysed live; recorded only when you press Record take, and only to your device. |
| `VIBRATE` | Granted at install. Used only when you turn on the metronome's Feel the beat switch, which is off each time you open that screen. |

The app asks for no location, contacts, storage, camera or network permission.

## Children

Bocal is a general music practice app, is not directed at children, and A System of Cells
collects no personal information from anyone, including children.

## Changes

If this policy changes, the "Last updated" date above changes with it, and the revised policy
is published at this same URL.

## Contact

Bocal is made by **A System of Cells**. Questions about this policy or the app:
bocal@asystemofcells.com
