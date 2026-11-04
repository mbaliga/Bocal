# Privacy Policy — Bocal

> **This is the working copy, not the hosted one.** The URL Play Console points at
> is **https://asystemofcells.com/bocal/privacy**. Keep the two in sync by hand.
> It describes the Play build (the `release` variant of `main` @ `f10ed32`), read on
> 2026-11-04. Re-check it against the signed bundle you publish, and against
> `play-console.md`: the Data safety answers must agree with this page.

**Last updated: 4 November 2026**

Bocal is a music practice app for woodwinds, harmonica, guitar and voice (package
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
  keep no audio. When a tuning session ends, Bocal saves a short summary on your device (the
  notes detected, how far from pitch they were, and how long you played) to build your
  practice history.
- **Recording starts only when you press Record take**, on the Analyze screen or the Vocal
  stage. You can also import an audio file you choose; it is copied into the same library. A
  take stops when you press Finish, after 10 minutes, or if you leave the screen or switch
  apps, and what was recorded so far is kept. The library holds up to 12 takes, and Bocal
  never deletes a take on its own.
- Takes are saved in the app's private storage on your device (the browser storage inside the
  app, IndexedDB), so they survive closing the app. If that storage fails, a take lasts only
  for the current session and the app says so.
- You can rename, tag, export or delete each take in the app. Uninstalling Bocal removes
  them. A file you export with Save As goes where you choose and is not removed by
  uninstalling.
- Bocal stops listening when you leave the app, and does not start again until you ask.
  You can revoke the microphone permission at any time in Android's settings.

## What else is stored, and where

In the app's private storage on your device: your settings and preferences, your practice log
and weekly goal, the tuning summaries above, a lesson note, coach and player names and an
assignment if you type them, song titles you add, equipment notes, saved exercises, melodies
and metronome presets, your vocal range, a skill rating computed from your practice, and your
takes with their tags and notes. Some lists keep only the most recent entries and drop the
oldest once full.

Other app data is not additionally encrypted by the app, beyond Android's own storage
encryption. The app turns off Android's cloud backup, so Android Auto Backup does not copy this
data to your Google account. It does not configure Android's phone-to-phone transfer, and on
some devices that transfer can still carry app data to a new phone.

**Keeping and deleting.** You can delete individual takes, practice-log entries, saved
exercises, melodies, metronome presets and sequences, equipment notes, and clear your vocal
range, inside the app. There is no delete-all button, and some items cannot be removed in the
app: the lesson note (you can only overwrite it), song titles, the skill rating, saved
sessions and the coach plan (you can only overwrite it). Removing everything is done with
Android's Clear storage for Bocal, or by uninstalling. Neither removes files you exported.

## What is sent off your device, and to whom

**Nothing, by Bocal.** The app has no internet permission, loads nothing from the web, and
contains no analytics or advertising code.

A few things you tap hand over to another app, which then has its own policy:

- A credit or source link opens in your browser or another app (the sites linked are
  sketchfab.com, creativecommons.org, cgtrader.com, yamaha.com and legere.com).
- If your Android System WebView is too old, Bocal shows a screen with a button that opens
  Google Play.
- Save As, and in some cases Share, write or send a file to the location or app you pick.
  That can be a cloud-backed folder, in which case that service handles the file.

Android System WebView, which runs the app's screens, is a part of Android with its own
settings and policies. Bocal adds nothing to it.

## Permissions, and why each exists

| Permission | Why |
|---|---|
| `RECORD_AUDIO` | To hear the note you play or sing, so the app can show your pitch and tone. Analysed live; recorded only when you press Record take, and only to your device. |
| `VIBRATE` | Optional. Used only for the metronome's Feel the beat setting, which is off until you turn it on. |

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
