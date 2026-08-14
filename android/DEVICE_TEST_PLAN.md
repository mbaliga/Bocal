# Bocal Android physical-device acceptance plan

## Automated on-target gate

Run `device-release-check.sh` with exactly one authorized adb target. It verifies install, cold launch, immediate crash absence, primary UI reachability and microphone revoke/grant behavior.

## Manual gates

### Audio and lifecycle
- Fresh install: no microphone prompt until Tune or Analyze is started.
- Deny permission: app remains usable and explains why mic access is needed.
- Grant permission: tuner/analyzer starts without restart.
- Background app while tuner/analyzer/metronome is active: audio/capture stops.
- Resume: audio does not restart without explicit user action.
- Exercise speaker, wired headset and Bluetooth routes; route failure must not leave the UI falsely "listening".
- Play clean long tones across low/mid/high sax and oboe registers; watch for octave confusion, stale notes and low-confidence flicker.

### Sax detailed Lab
- Front/Player: each of the 23 touch targets lands on a plausible player-operated control, never merely on a remote pad cup.
- Left controls: palm/pinky controls remain reachable and visually aligned.
- Right controls: side/pinky controls remain aligned.
- Back/thumb: octave/thumb controls align to the back mechanism.
- For representative B-flat3, C-sharp4, A4, high E/F/F-sharp: selected written note, concert note and target set agree with the validated metadata.
- Challenge mode never promotes an unvalidated node as a correct touch-piece.

### Howarth S20C oboe
- Load without missing textures or black/transparent geometry.
- Rotate, zoom and pick parts for at least 5 minutes without renderer death or runaway memory growth.
- Exercise Front/Left/Right/Back views.
- Confirm copy continues to say anatomy preview / not fingering trainer.
- Force app background/resume and screen rotation; model restores or reloads cleanly.

### Accessibility
- TalkBack: five primary tabs have stable labels and selected state.
- Tuner state, pitch gauge and pitch trace have useful spoken summaries rather than color-only meaning.
- Sliders expose values and can be adjusted with accessibility actions.
- Instrument Lab controls, note browser, loading state and part selection are reachable without relying on the canvas alone.
- Switch Access can reach primary CTAs and Lab controls.
- Test largest font size and increased display size; no essential CTA disappears or overlaps irrecoverably.
- Color is never the sole signal for pitch direction, selected fingering or challenge result.
