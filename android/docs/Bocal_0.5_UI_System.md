# Bocal Android 0.5 UI System

This document records the 0.5 design update requested for the next packaged source drop.

## 1) Navbar behavior

- Replace the old plain bottom navigation with a floating two-tier dock.
- Top tier = contextual utility row with:
  - left circular quick action to jump to Lab,
  - central rounded segmented control for instrument context (`Alto`, `Oboe`, `Clarinet`),
  - right circular quick action to jump to Practice.
- Bottom tier = primary navigation dock.
  - The active destination expands into a filled capsule with glyph + label.
  - Inactive destinations remain icon-forward for compactness.
  - Destinations in 0.5: Tune, Lab, Sound, Pulse, Analyze, Practice.
- The navbar should feel elevated, tactile and light-on-dark, matching the attached reference direction.

## 2) Component rules

- Cards use one of three visual types:
  1. **Workspace hero cards** for page-level orientation.
  2. **Visual info cards** for feature, backlog or evidence messages.
  3. **Utility cards** for metrics, sliders, controls and lists.
- Shapes are soft and large-radius. Most major containers use 20–28dp rounding.
- Major cards must include a compelling visual field or gradient surface; avoid text-only slabs where the feature deserves emphasis.
- Eyebrows are short, uppercase and signal intent rather than filler.
- Neutral evidence always outranks decorative scoring.

## 3) Clarinet integration rules

- Clarinet is added as a runtime instrument option in the shared instrument selector.
- Current clarinet scope in 0.5 is **anatomy preview only**.
- Clarinet can reuse the part-inspector Lab shell used by oboe.
- Clarinet must not present validated fingering claims yet.
- Clarinet licensing is CC-BY-NC-4.0, so the package must keep explicit attribution and note the non-commercial boundary.

## 4) Image / card design system

- Every major screen should contain at least one visually compelling card surface.
- The stronger Sax Lab visual treatment becomes the reference tone for the broader app.
- Use accent-led gradients, compact badges and clear hierarchy.
- Avoid flat lists of plain cards when a richer visual grouping communicates more clearly.
- Visuals should clarify state, not just decorate it.

## 5) Screen-by-screen UI updates

### Tune
- Upgrade the main tuner shell.
- Add stronger hero treatment, a clearer pitch state, a card linking into the 3D Lab, and richer evidence cards.

### Lab
- Keep the detailed 3D viewer.
- Add clarinet as a selectable runtime instrument.
- Preserve sax fingering mode and keep oboe/clarinet in anatomy-preview mode.

### Sound
- Restore Sound as its own destination.
- Move reference tone tools here.
- Keep the screen ready for future drones, intervals and tone-library expansion.

### Pulse
- Upgrade presentation of tempo, beat pattern and state.
- Keep the functionality lean but make the UI visually stronger.

### Analyze
- Keep the current compact analysis scope.
- Present the metrics in the new card system.
- Reserve room for future waveform/spectrum cards.

### Practice
- Upgrade timer, focus cards and sessions list to the new image/card system.
- Keep export and note capture obvious.
