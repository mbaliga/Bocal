# Bocal standalone web app

This is a self-contained, static-first Bocal reference app. It does not require a database, account, API key, Cloudflare Worker, or maintained backend. The production build includes the HTML shell, bundled TypeScript/Three.js, CSS, instrument catalog, and all 35 GLB files.

## Run the ready-made build

Browsers restrict microphone and module/asset loading from `file://`, so serve the `dist` directory over localhost:

```bash
cd dist
python3 -m http.server 8080
```

Open <http://localhost:8080>. Microphone capture works on localhost in current browsers after permission is granted.

## Develop or rebuild

```bash
npm install
npm run test
npm run dev
# or
npm run build
```

The generated `dist` folder can be uploaded to a normal static host. Set MIME types for `.glb` to `model/gltf-binary` (or `application/octet-stream`) and do not apply HTML rewrites to model URLs.

## Implemented in this reference

- microphone tuner with clean-room YIN-style detection, reference A, tolerance, written/concert pitch, range and stability trace
- interactive local glTF lab with orbit/zoom, selectable named controls, instrument switcher, and alto-sax core fingering playback
- metronome with meters, subdivisions, downbeat accent, random silence, tap tempo, visual beat and optional vibration
- two-octave reference keyboard with equal, just-major, and Pythagorean examples
- live waveform, harmonic-energy view, confidence/brightness/vibrato signal descriptors
- practice timer, focus plan, local session history, JSON export, lesson note, and local tab recording/download
- desktop and mobile task-first navigation; no sign-in and no server persistence

## Boundaries

This is a working product reference, not full TonalEnergy parity. It lacks advanced preset sequencing, sampled instrument sounds, MIDI/Ableton/BodyBeat integrations, video workflows, robust offline recording storage, custom temperament editing, a full staff/interval trainer, and production-calibrated DSP. The handoff matrix labels every capability as working, partial, or planned.

The 3D models are educational abstractions. The alto sax core map is present; the other instruments intentionally display a validation notice instead of guessed note fingerings.

## Privacy

Audio frames are analyzed in the browser and are not uploaded by this code. Practice data uses `localStorage`. Recording blobs remain in the current tab unless the user downloads them. A production privacy review must still verify the chosen host, headers, analytics, crash reporting, and store disclosures.
