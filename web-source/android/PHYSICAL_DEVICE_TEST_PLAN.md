# Bocal Android physical-device verification

This protocol separates checks the device can automate from measurements that need external audio equipment. Android capability flags are not round-trip latency measurements.

## Current checkpoint

| Area | Result | Evidence |
| --- | --- | --- |
| APK install and launch | Not run — no physical Android device was connected to the build workspace | Run `android/scripts/run-physical-device-checks.sh` |
| Bronze saxophone rendering | Not run on physical hardware | Rotate and orbit the model during the lab check below |
| Microphone pitch accuracy | Not run — needs a calibrated external tone source | Record the table below |
| Input latency | Not run — needs wired loopback or an acoustic reference recording | Record the table below |
| Audio interruption | Not run on physical hardware | Use call, alarm and competing-audio cases below |
| Rotation and navigation side | Instrumentation test authored; not executed without a device | `BocalDeviceInstrumentedTest` |

## Automated installation and rotation pass

1. Enable USB debugging and connect exactly one physical device.
2. From the repository root, run `android/scripts/run-physical-device-checks.sh`.
3. The script preserves app data, installs the current debug APK, grants microphone access, runs instrumentation, relaunches Bocal and stores evidence under the ignored `android/device-results/` directory.
4. Confirm the 3D lab remains usable after portrait → landscape → portrait rotation. In landscape, select both left and right arc positions in Settings and repeat.

## Microphone accuracy

Use a calibrated sine source or a reference instrument measured simultaneously by a trusted bench tuner. Keep automatic gain, Bluetooth and speaker processing out of the path where possible. Test at 220, 440 and 880 Hz, then three normal saxophone notes across the playable range.

| Device / Android | Source | Expected | Bocal median | Error (cents) | Lock time | Pass |
| --- | --- | ---: | ---: | ---: | ---: | --- |
|  | Sine | 220.0 Hz |  |  |  | ≤ 5 cents |
|  | Sine | 440.0 Hz |  |  |  | ≤ 5 cents |
|  | Sine | 880.0 Hz |  |  |  | ≤ 5 cents |
|  | Saxophone low |  |  |  |  | ≤ 8 cents |
|  | Saxophone middle |  |  |  |  | ≤ 8 cents |
|  | Saxophone upper |  |  |  |  | ≤ 8 cents |

Record at least ten stable readings per source. Report the median and worst error; do not cherry-pick the best frame.

## Latency

For input-to-display latency, film a wired reference click and Bocal’s lock-state change at 240 fps, or use a wired loopback and screen-event trace. Bluetooth is a separate test because its buffering dominates the path.

| Path | Median | P95 | Pass target |
| --- | ---: | ---: | --- |
| Built-in microphone → lock display |  |  | Median ≤ 120 ms after a stable analysis window |
| Wired headset microphone → lock display |  |  | Median ≤ 120 ms after a stable analysis window |
| Pulse click drift over 5 minutes at 120 BPM |  |  | ≤ 20 ms cumulative drift |

## Interruptions

- Start the tuner, receive a phone call, then return. Capture must stop cleanly and restart only after the user taps Start.
- Start the tuner, trigger an alarm and dismiss it. Bocal must show that listening paused; it must not retain the microphone in the background.
- Start audio in another app while Bocal is listening. Audio-focus loss must stop capture without a crash.
- Lock and unlock the phone while tuning and while a practice timer is running. Tuning stops; the practice timer reconstructs elapsed time from its persisted start timestamp.
- Remove and reconnect a wired or USB microphone. Bocal must recover on the next explicit Start action.

## Visual acceptance

- The model is bronze against the light charcoal radial backdrop; the neck, body, bow and bell remain legible at minimum and maximum zoom.
- Only active fingering targets glow cyan. No hand or body geometry appears.
- Targets remain visible during orbit and are not covered by the navigation arc or fingering panel.
- The selected landscape navigation side persists after process death.
