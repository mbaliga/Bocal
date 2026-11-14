# images/

Sizes: Play Console help, "Add preview assets" (support.google.com/googleplay/android-developer/answer/9866151).
`Personal-Tracker/store/ASSET_SPECS.md` has check commands, but it is stale on the icon: it says
no alpha, while Play allows alpha (a flat background is still the safer design).

## Needed, none present yet

- `icon.png` 512x512, 32-bit PNG, up to 1024 KB (Play Console help, "Add preview assets":
  the icon may have alpha; the feature graphic and screenshots may not).
  The launcher icon is five legacy PNGs under `android/app/src/main/res/mipmap-*`, the
  largest 192 px, so the 512 px icon has to be made from the Bocal logo
  (`web-source/public/images/bocal-logo.png` is only 256x256).
- `featureGraphic.png` 1024x500, no alpha
- `phoneScreenshots/` 2 to 8 PNG or JPEG, no alpha, each side 320 to 3840 px with the long
  side at most twice the short side (1080x1920 is a safe default), captured on a device from
  the current build.

`screenshots/` at the repo root holds five prototype captures (695x1536, an older UI, and
an aspect ratio past Play's 2:1 limit). They are identical to `android/docs/reference-ui/`.
Do not upload them.

## Shoot these

1. The tuner mid-note, with a real reading rather than a centred needle.
2. The Vocal stage with a live pitch graph.
3. The 3D instrument lab, rotated so the mechanism is legible.
4. A practice workflow in progress.

## Before any image goes in a store asset

- A screenshot that shows the alto saxophone or the oboe model must carry the CC BY 4.0
  credit in the listing (see `docs/store/play-console.md`).
- Do not reuse the seven `bocal-*-cinematic.webp` instrument-picker images or their
  `web-source/assets/source/*.png` masters. `web-source/README.md` calls the masters generated
  visual masters, and their source and licence are recorded nowhere.
- Do not show the Settings model-sourcing list: it lists unshipped, paid and blocked
  candidates.

```sh
adb exec-out screencap -p > shot.png
magick shot.png -background black -alpha remove -alpha off phoneScreenshots/01.png
```
