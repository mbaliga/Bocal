# images/

Sizes and check commands: `Personal-Tracker/store/ASSET_SPECS.md`.

## Needed, none present yet

- `icon.png` 512x512 no alpha · `featureGraphic.png` 1024x500 no alpha
- `phoneScreenshots/` — 2 to 8, 1080x1920, no alpha.

`screenshots/` at the repo root holds prototype captures. They are **prototype**
shots, from the web build, and predate the current Android app. Do not upload them
as store assets without checking each one still matches what ships.

## Shoot these

1. The 3D instrument lab, rotated so the mechanism is legible.
2. The tuner mid-note, with a real reading rather than a centred needle.
3. A practice workflow in progress.

⚠️ **Do not put a third-party 3D model in a store screenshot until its licence has
been confirmed to permit it.** See `docs/store/play-console.md`. A store listing is
publication, and some licences that allow use in an app still restrict promotional
imagery.

```sh
adb exec-out screencap -p > shot.png
magick shot.png -background black -alpha remove -alpha off phoneScreenshots/01.png
```
