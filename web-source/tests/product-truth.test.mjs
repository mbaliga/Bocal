import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tuner starts blank and exposes its lock policy", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /useState<PitchReading \| null>\(null\)/);
  assert.match(source, /Noise gate · 3-frame lock · 550 ms dropout hold/);
  assert.doesNotMatch(source, /You tend to arrive slightly flat/);
  assert.doesNotMatch(source, /hz: 261\.1/);
});

test("practice reporting uses recorded evidence instead of demo statistics", async () => {
  const source = await readFile(new URL("../app\/PracticeTools.tsx", import.meta.url), "utf8");
  assert.match(source, /Bocal skill rating/);
  assert.match(source, /The same saved data always produces the same result/);
  assert.doesNotMatch(source, /const WEEK/);
  assert.doesNotMatch(source, /\+18%/);
});

test("the sax lab offers explicit front, side, and back inspections", async () => {
  const source = await readFile(new URL("../app/SaxophoneLab.tsx", import.meta.url), "utf8");
  for (const label of ["Player", "Left controls", "Right controls", "Thumb / back"]) {
    assert.match(source, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(source, /left hand operates the upper section and the right hand the lower section/i);
});

test("the licensed sax model owns the fingering targets", async () => {
  const lab = await readFile(new URL("../app/SaxophoneLab.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../app/ImportedInstrumentCanvas.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(lab, /src="\/models\/saxophone-alto\.glb"/);
  assert.match(lab, /fingeringMarkers=\{SAX_KEYS\}/);
  assert.match(lab, /activeMarkerIds=\{activeKeys\}/);
  assert.doesNotMatch(lab, /Saxophone model mode/);
  assert.match(canvas, /fingeringMarkers/);
  assert.match(canvas, /markerBelongsInView/);
  assert.match(styles, /bocal-alto-sax-cinematic\.webp/);
});

test("spatial learning keeps active contacts visible with key-only glow", async () => {
  const lab = await readFile(new URL("../app/SaxophoneLab.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../app/ImportedInstrumentCanvas.tsx", import.meta.url), "utf8");
  assert.match(lab, /Key glow/);
  assert.match(lab, /Bronze study · key glows aligned to the reference mesh/);
  assert.match(canvas, /\(active \|\| showFingeringGuides\)/);
  assert.match(canvas, /CanvasTexture/);
  assert.match(canvas, /SpriteMaterial/);
  assert.doesNotMatch(canvas, /buildPhantomHands|TubeGeometry|CylinderGeometry|showPhantomHands/);
});

test("every imported learning model uses the legible bronze study finish", async () => {
  const canvas = await readFile(new URL("../app/ImportedInstrumentCanvas.tsx", import.meta.url), "utf8");
  const saxLab = await readFile(new URL("../app/SaxophoneLab.tsx", import.meta.url), "utf8");
  const oboeLab = await readFile(new URL("../app/OboeLab.tsx", import.meta.url), "utf8");
  assert.match(canvas, /bronzeStudyMaterial/);
  assert.match(canvas, /bocalBronzeStudy/);
  assert.match(canvas, /0xd7a94d/);
  assert.match(canvas, /0xa66d2d/);
  assert.match(saxLab, /Bronze study finish/);
  assert.match(oboeLab, /Uniform bronze study/);
});

test("first run uses an immersive instrument gallery and replayable onboarding", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const experience = await readFile(new URL("../app/InstrumentExperience.tsx", import.meta.url), "utf8");
  assert.match(page, /InstrumentPickerExperience/);
  assert.match(page, /Replay the onboarding guide/);
  assert.match(experience, /What are you playing today\?/);
  // Every gallery entry has to say what a player actually gets. Flute and
  // bassoon have a 2D fingering chart but no licensed 3D model, and say so;
  // the clarinet now ships the same way -- its old "Not shipping" status
  // was already false the day the chart made it a real instrument in the
  // app, since a 2D chart needs no licensed model at all.
  assert.match(experience, /Fingering chart · no 3D model yet/);
  assert.match(experience, /Fingering chart · 3D model not licensed/);
  assert.doesNotMatch(experience, /Not shipping · commercial licence required/);
  assert.match(experience, /availableId: "clarinet"/);
  assert.match(experience, /Watch the right keys light up/);
  assert.doesNotMatch(experience, /ghost-palm|Hand guide|See the grip/);
});

test("landscape navigation can sit on either side and persists locally", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /bocal-navigation-side/);
  assert.match(page, /Landscape navigation side/);
  assert.match(page, /nav-\$\{railSide\}/);
  assert.match(styles, /@media \(orientation: landscape\) and \(min-width: 681px\)/);
  assert.match(styles, /\.side-rail \{ display: none; \}/);
  assert.match(styles, /\.nav-right \.mobile-nav/);
  assert.match(styles, /\.mobile-nav button\.is-active/);
});

test("analysis exposes local waveform, spectrum, and take recording without fake grading", async () => {
  const source = await readFile(new URL("../app/AnalysisView.tsx", import.meta.url), "utf8");
  assert.match(source, /Waveform/);
  assert.match(source, /Spectrum/);
  assert.match(source, /MediaRecorder/);
  assert.match(source, /doesn’t grade your tone/i);
  assert.match(source, /stay in this browser/i);
});

test("tuner exposes a calibrated tone generator and precision choices", async () => {
  const source = await readFile(new URL("../app/ToneGenerator.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /targetHzFor/);
  assert.match(source, /Array\.from\(\{ length: 8/);
  assert.match(source, /Waveform|waveform/);
  assert.match(source, /Synthetic reference voice/);
  assert.match(page, /Ultra ±2¢/);
});

test("practice tools include measured metronome drills, goals, coach mode and song progress", async () => {
  const source = await readFile(new URL("../app/PracticeTools.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/practice-data.ts", import.meta.url), "utf8");
  assert.match(source, /Silent-bar drill/);
  assert.match(source, /Count-in/);
  assert.match(source, /Save the feel/);
  assert.match(source, /Gentle goal/);
  assert.match(source, /Coach mode/);
  assert.match(source, /Export brief/);
  assert.match(source, /onProgress/);
  assert.match(data, /updateSongWish/);
});

test("analysis keeps more than one take and supports local take management", async () => {
  const source = await readFile(new URL("../app/AnalysisView.tsx", import.meta.url), "utf8");
  assert.match(source, /type RecordingTake/);
  assert.match(source, /Import audio/);
  assert.match(source, /Delete/);
  assert.match(source, /Loop/);
  assert.match(source, /playbackRate/);
  assert.match(source, /takes\.map/);
});
