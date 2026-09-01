import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadProfiles() {
  const source = await readFile(new URL("../app/instruments.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "instruments.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { INSTRUMENTS, INSTRUMENT_GROUPS, instrumentsInGroup } = await loadProfiles();

test("other instrument families expose concrete profiles instead of decorative cards", () => {
  for (const group of ["bowed-strings", "fretted-strings", "brass", "keyboards", "percussion", "voice", "electronic"]) {
    assert.ok(INSTRUMENT_GROUPS[group], `${group} is a picker group`);
    const profiles = instrumentsInGroup(group);
    assert.ok(profiles.length > 0, `${group} has a selectable profile`);
    for (const profile of profiles) {
      assert.equal(profile.group, group);
      assert.equal(profile.labTier, "none", `${profile.id} cannot imply a 3D lab`);
      assert.match(profile.labStatus, /no .*instruction|no MIDI input/i, `${profile.id} clearly bounds unavailable teaching/device work`);
    }
  }
});

test("baseline written-pitch profiles use their declared conventional offsets", () => {
  const concertC4 = 60;
  assert.equal(concertC4 + INSTRUMENTS["trumpet-bb"].writtenOffset, 62); // B-flat trumpet: concert C sounds as written D.
  assert.equal(concertC4 + INSTRUMENTS["horn-f"].writtenOffset, 67); // F horn: concert C sounds as written G.
  for (const id of ["guitar", "bass-guitar", "double-bass"]) {
    assert.equal(concertC4 + INSTRUMENTS[id].writtenOffset, 72, `${id} writes one octave above sounding pitch`);
  }
  for (const id of ["violin", "viola", "cello", "harp", "trombone", "tuba-concert", "piano", "organ-synth", "mallet-percussion", "voice-concert", "electronic-audio"]) {
    assert.equal(INSTRUMENTS[id].writtenOffset, 0, `${id} is a concert-pitch baseline`);
  }
});

test("the primary staff clef never pretends to solve a whole-score notation problem", () => {
  assert.equal(INSTRUMENTS.viola.clef, "alto");
  assert.equal(INSTRUMENTS.cello.clef, "bass");
  assert.match(INSTRUMENTS.piano.tunerDescription, /single-note treble display/i);
  assert.match(INSTRUMENTS.harp.tunerDescription, /grand-staff notation .*not modelled/i);
});
