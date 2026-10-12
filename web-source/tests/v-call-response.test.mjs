// Package V-C: the play-along drill. Source-level guards for what a person
// reading the screen is promised: honest copy, the three mounts, the audio
// clock, and the one-AudioContext rule. The drill's logic is tested in
// call-response.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Comments are the author's notes, not what a player reads.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const SCREEN_SOURCES = [
  "../app/CallAndResponse.tsx",
  "../app/call-response-canvas.ts",
  "../app/call-response-sources.ts",
];

const NEW_SOURCES = [
  "../app/call-response.ts",
  "../app/call-response-canvas.ts",
  "../app/call-response-sources.ts",
  "../app/call-host.ts",
  "../app/CallAndResponse.tsx",
];

test("the drill's screen makes no claim of health, correctness, marks, grades, voice types or classification", async () => {
  for (const path of SCREEN_SOURCES) {
    const source = withoutComments(await read(path));
    for (const word of ["healthy", "correct", "score", "grade", "voice type", "classif"]) {
      assert.doesNotMatch(source, new RegExp(word, "i"), `${path} must not contain "${word}"`);
    }
  }
});

test("the honesty line is on screen: pitch and order only, timing not judged, thresholds are Bocal's own", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /className="call-response-honesty"/);
  assert.match(screen, /Bocal listens for pitch and order only/);
  assert.match(screen, /Timing is not judged/);
  assert.match(screen, /Bocal&rsquo;s own settings/);
  assert.match(screen, /not an exam standard/);
  assert.match(screen, /&ldquo;matched&rdquo; or &ldquo;not yet&rdquo;, never a mark/);
  // The plot says it is not a time axis.
  assert.match(screen, /This is not a time axis/);
});

test("the three mounts exist: Vocal stage, Tune workspace and the sax lab's Learn mode", async () => {
  const vocal = await read("../app/VocalStudio.tsx");
  const page = await read("../app/page.tsx");
  const lab = await read("../app/SaxophoneLab.tsx");
  assert.match(vocal, /import \{ CallAndResponse \} from "\.\/CallAndResponse";/);
  assert.match(page, /import \{ CallAndResponse \} from "\.\/CallAndResponse";/);
  assert.match(lab, /import \{ CallAndResponse \} from "\.\/CallAndResponse";/);
  // Vocal: in the V-C slot, which stays where it was so the other slots' guard still holds.
  const slot = vocal.indexOf("{/* V-C: play-along */}");
  assert.ok(slot > 0);
  assert.match(vocal.slice(slot, slot + 400), /<CallAndResponse instrumentId="vocal"/);
  assert.equal(vocal.split("<CallAndResponse").length, 2, "mounted once in the Vocal studio");
  // Tune: its own column, only in the Tune workspace, fed by the one tuner.
  assert.match(page, /\{mode === "tune" && <CallAndResponse variant="page"[^\n]*graph=\{tuner\.vocalGraph\} \/>\}/);
  assert.equal(page.split("<CallAndResponse").length, 2, "mounted once on the page");
  // Learn mode only.
  assert.match(lab, /\{trainerMode === "learn" && <CallAndResponse instrumentId=\{instrumentId\} notation=\{notation\} saTonic=\{saTonic\} \/>\}/);
  assert.equal(lab.split("<CallAndResponse").length, 2, "mounted once in the sax lab");
});

test("audio is scheduled on the AudioContext clock, never a timer", async () => {
  for (const path of ["../app/call-response.ts", "../app/CallAndResponse.tsx", "../app/call-response-canvas.ts", "../app/call-response-sources.ts", "../app/call-host.ts"]) {
    const source = withoutComments(await read(path));
    assert.doesNotMatch(source, /setTimeout|setInterval/, `${path} must not use a timer`);
  }
  const tuner = await read("../app/useTuner.ts");
  const schedule = tuner.slice(tuner.indexOf("const schedulePhrase = useCallback"), tuner.indexOf("const readClocks = useCallback"));
  assert.ok(schedule.length > 200, "schedulePhrase exists");
  assert.match(schedule, /audioContext\.currentTime \+ 0\.12/);
  assert.match(schedule, /oscillator\.start\(begin\)/);
  assert.match(schedule, /oscillator\.stop\(end \+ 0\.02\)/);
  assert.match(schedule, /targetHzFor\(tone\.midi, tuningOptionsRef\.current\)/);
  assert.doesNotMatch(schedule, /setTimeout|setInterval/);
  // The UI follows the audio clock once per animation frame.
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /requestAnimationFrame/);
  assert.match(screen, /host\.clock\(\)|L\.host \? L\.host\.clock\(\)/);
});

test("one AudioContext per workspace: the drill goes through the tuner's hook and opens none of its own", async () => {
  for (const path of NEW_SOURCES) {
    assert.doesNotMatch(await read(path), /new AudioContext|new webkitAudioContext|getUserMedia/, `${path} must not open audio itself`);
  }
  const tuner = await read("../app/useTuner.ts");
  assert.match(tuner, /publishCallHost\(callHost\)/);
  assert.match(tuner, /callHost,\n/);
  assert.match(tuner, /stopPhrase\(\);\n/, "stopping the microphone silences a queued phrase");
});

test("the tuner's frames feed the drill: listening reads the vocal buffer between two moments", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /buffer\.between\(/);
  assert.match(screen, /judgeRound\(/);
  // The buffer holds written pitch unless the readout is on concert; the drill judges concert pitch.
  assert.match(screen, /sample\.midi - offset/);
  const tuner = await read("../app/useTuner.ts");
  assert.match(tuner, /bufferOffset: options\.displayMode === "concert" \? 0 : instrument\.writtenOffset/);
});

test("it works before the tuner has started: a message and the existing listen button, never a silent failure", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /The microphone is off\. Bocal needs it to hear your answer\./);
  assert.match(screen, /Start microphone/);
  assert.match(screen, /Starting the microphone\. The phrase plays as soon as it is on\./);
  assert.match(screen, /The microphone stopped, so that round was dropped\./);
});

test("the controls are there: phrase source, how close, tries, move on by itself, octave", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /<optgroup key=\{group\.id\} label=\{group\.label\}>/);
  assert.match(screen, /aria-label="How close the notes must be"/);
  assert.match(screen, /Tries per phrase/);
  assert.match(screen, /Move on by itself/);
  assert.match(screen, /<span>Octave<\/span>/);
  assert.match(screen, /Again<\/button>/);
  assert.match(screen, /Next<\/button>/);
  const sources = await read("../app/call-response-sources.ts");
  assert.match(sources, /Saved exercises/);
});

test("each session is logged as practice activity with the phrase name and the attempts", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /recordPracticeActivity\(/);
  assert.match(screen, /Play-along: \$\{session\.name\}, \$\{tries\}, \$\{outcome\}/);
  assert.match(screen, /matched on attempt/);
  assert.match(screen, /not yet matched/);
});

test("the phrase type is the one the melody line will supply, and phrases arrive through props", async () => {
  const logic = await read("../app/call-response.ts");
  assert.match(logic, /TODO\(V-B\): import from melody-line\.ts once merged/);
  assert.match(logic, /export type CallPhrase = \{\s*id: string;\s*name: string;\s*tempoBpm: number;\s*notes: \{ midi: number; beats: number \}\[\];\s*\};/);
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(screen, /phrases\?: CallPhrase\[\];/);
  assert.match(screen, /suppliedLabel\?: string;/);
});

test("styles: its own file, imported by the component, and globals.css is untouched", async () => {
  const screen = await read("../app/CallAndResponse.tsx");
  const css = await read("../app/styles/call-response.css");
  const globals = await read("../app/globals.css");
  assert.match(screen, /import "\.\/styles\/call-response\.css";/);
  assert.match(css, /\.call-response \{/);
  assert.match(css, /--cr-hit:/);
  assert.doesNotMatch(globals, /call-response|--cr-/);
});

test("the play-along settings key lives in storage-keys.ts and is read through the persisted-setting hook", async () => {
  const keys = await read("../app/storage-keys.ts");
  const screen = await read("../app/CallAndResponse.tsx");
  assert.match(keys, /export const CALL_RESPONSE_SETTINGS_KEY = "bocal-call-response-v1";/);
  assert.match(screen, /usePersistedSetting<CallSettings>\(CALL_RESPONSE_SETTINGS_KEY/);
  assert.doesNotMatch(screen, /localStorage/);
});

test("new source stays parseable by the oldest WebView: no ??=, ||=, .at() or Object.hasOwn", async () => {
  for (const path of NEW_SOURCES) {
    const source = withoutComments(await read(path));
    assert.doesNotMatch(source, /\?\?=|\|\|=|&&=/, `${path}: logical assignment`);
    assert.doesNotMatch(source, /\.at\(/, `${path}: .at()`);
    assert.doesNotMatch(source, /Object\.hasOwn/, `${path}: Object.hasOwn`);
    assert.doesNotMatch(source, /\.replaceAll\(/, `${path}: replaceAll`);
  }
});

test("the theme audit walks the drill's states in both themes", async () => {
  const theme = await read("./theme.test.mjs");
  for (const state of ["tune/call-response", "tune/call-response-mic-off", "vocal/call-response", "vocal/call-response-playing", "vocal/call-response-result", "lab/learn-call-response"]) {
    assert.ok(theme.includes(`'${state}'`), `theme.test.mjs must record ${state}`);
  }
});

test("the browser smoke opens the drill in the Tune workspace and sees its controls", async () => {
  const smoke = await read("./e2e-smoke.mjs");
  assert.match(smoke, /play-along-tune/);
  assert.match(smoke, /call-response/);
});
