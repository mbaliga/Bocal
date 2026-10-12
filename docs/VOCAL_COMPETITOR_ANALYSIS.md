# Bocal Vocal feature review

**Reviewed:** 13 October 2026

**Scope:** Singing pitch practice, not speech or clinical voice analysis.

## Competitor snapshot

| Product | Publicly documented strengths | Practical comparison with Bocal |
|---|---|---|
| [Vocal Pitch Monitor](https://play.google.com/store/apps/details?id=com.tadaoyamaoka.vocalpitchmonitor) | Real-time pitch graph over seven octaves, automatic display scrolling, hold, recording/playback, save/load and tuner | The closest lightweight Android comparison. Bocal adds instrument-aware chromatic tuning, a short pitch history, local practice logging and broader rhythm/analysis tools. The monitor has longer graph review and saved recordings as explicit vocal workflows. |
| [Singscope](https://www.singscope.com/) | Live singing pitch graph, pan/zoom review, voice playback and saved recordings; optional sheet-music pack with warm-ups, note playback, tempo and transposition | Bocal records and plays back vocal takes with their pitch line, and plays six short melodies of its own as bands on the live graph. It has no sheet-music pack, no warm-up library beyond three steps, no tempo or transposition of recordings, and no singing score. |
| [Yousician Singing](https://yousician.com/singing) | Teacher-authored learning paths, interactive exercises and songs, real-time pitch/timing feedback, range-related content, playback/section practice and tempo controls | Bocal is a local-first practice companion. It has no licensed song library, curriculum, score-following, timing grade or technique assessment. Its current Vocal routine gives a modest self-paced structure and logs the work locally. |

## Bocal capability check

The Vocal profile is first-class and concert-pitch. It uses the shared chromatic tuner and its configurable pitch range, 10-second history, reference tone, local Analyze recording/review, and Practice activity history. The Vocal workspace now adds a live singing pitch graph with hold, pan and zoom review, a self-recorded vocal range, three selectable warm-up steps that can draw on the graph, saved vocal takes with playback and a pitch-line overlay, target melodies with per-note pitch figures, a pause/resume timer, completion tracking, and a local activity record that appears under Vocal in the practice map.

The feature is complete for Bocal's stated pitch-first companion scope: a singer can select Vocal, tune, observe a short pitch trace, follow and mark a simple routine, and retain practice history on device. It is not feature-equivalent to dedicated singing lesson or vocal-pitch graph products.

## Explicit remaining work

Shipped since the first review: a zoomable singing pitch graph (30 s default, up to 2 minutes, hold with pan and pinch zoom), a vocal range the singer records and the graph scales to, and Sustain, Glide and Start cleanly feedback drawn on the graph. This closes the gap with Vocal Pitch Monitor and Singscope on live graph and review.

Also shipped: saved vocal takes, recorded on the Vocal stage and kept on the device, played back with the take's own pitch line drawn over its waveform and with a second take laid over it; and target melodies. Six short melodies written for Bocal and a simple editor for the singer's own play as reference tones, the graph shows each note as a band with the singer's line over it, and afterwards each note gets two pitch figures: the average distance in cents and the time spent inside the band. That closes most of the gap with Vocal Pitch Monitor's recording and playback and with Singscope's saved recordings and note playback, at a much smaller scale.

- A voice teacher should review the warm-up wording before Bocal presents it as pedagogy. Current copy is kept general and advises staying comfortable and stopping if strained.
- The take's pitch line is read from the recording after it is made, so it is a picture of the finished take; it is not the live graph played back, and a quiet or breathy stretch can show as a gap. The graph itself still keeps only the last two minutes in memory.
- Vocal takes share the 12-take library with Analyze and are never removed automatically, so a full library has to be cleared by hand. Takes cannot be imported into the Vocal stage, only recorded there.
- The melody feedback is pitch only. There is no timing mark, no score-following and no technique assessment, and the figures are not a mark. The siren is two long notes with the slide left to the singer. There is no song catalog and no licensed melody, and the six melodies are short exercises, not repertoire.
- The play-along is not built. It needs separately designed and reviewed musical content and evaluation rules. The Vocal workspace still has an empty slot reserved for it.
- Melody figures have only been checked against synthetic readings. A microphone reading arrives a little after the sound, so the first moments of each note are partly the singer finding the pitch; that delay has not been measured on real phones.
- The vocal tracker band starts at 80 Hz (about E2), above the graph's C2 floor, so the lowest voices may read as silence below that. Widening it needs a physical-device check.
- Microphone behaviour across actual singing voices, phones and room conditions still needs physical-device validation before the Vocal profile is represented as fully production-validated. The graph, range finder and warm-up feedback have only been exercised with a synthetic tone source.

## Sources

- Vocal Pitch Monitor Google Play listing, accessed 13 October 2026: <https://play.google.com/store/apps/details?id=com.tadaoyamaoka.vocalpitchmonitor>
- Singscope feature and usage description, accessed 13 October 2026: <https://www.singscope.com/>
- Yousician Singing product description, accessed 13 October 2026: <https://yousician.com/singing>
