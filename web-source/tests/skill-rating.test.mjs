import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/skill-rating.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "skill-rating.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const skill = await loadModule();

test("no evidence means no score", () => {
  const rating = skill.calculateSkillRating(skill.emptySkillEvidence());
  assert.equal(rating.rating, null);
  assert.equal(rating.status, "unrated");
  assert.equal(rating.confidence, 0);
});

test("the same evidence always produces the same rating", () => {
  const session = skill.summarizeTunerSession(
    Array.from({ length: 90 }, (_, index) => (index % 7) - 3),
    Array.from({ length: 90 }, (_, index) => 58 + (index % 14)),
    4_000,
    "2026-08-10T12:00:00.000Z",
  );
  assert.ok(session);
  const evidence = skill.withTunerSession(skill.emptySkillEvidence(), session);
  assert.deepEqual(skill.calculateSkillRating(evidence), skill.calculateSkillRating(evidence));
  assert.equal(skill.calculateSkillRating(evidence).status, "provisional");
});

test("tuner summaries require enough accepted frames and use robust statistics", () => {
  assert.equal(skill.summarizeTunerSession([1, 2, 3], [69], 1000), null);
  const summary = skill.summarizeTunerSession(
    [0, 1, -1, 2, -2, 3, -3, 1, -1, 2, -2, 0, 1, -1, 40],
    [69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 70],
    1500,
    "2026-08-10T12:01:00.000Z",
  );
  assert.ok(summary);
  assert.equal(summary.medianAbsCents, 1);
  assert.equal(summary.madCents, 1);
  assert.deepEqual(summary.midiNotes, [69, 70]);
});

test("established status requires broad evidence, not a single flattering sample", () => {
  const tunerSessions = Array.from({ length: 3 }, (_, sessionIndex) => ({
    id: `t${sessionIndex}`,
    capturedAt: `2026-08-0${sessionIndex + 1}T12:00:00.000Z`,
    durationMs: 30_000,
    acceptedFrames: 220,
    medianAbsCents: 5,
    madCents: 2,
    inTuneRate: 0.6,
    midiNotes: Array.from({ length: 18 }, (_, index) => 58 + index),
  }));
  const fingeringAttempts = Array.from({ length: 30 }, (_, index) => ({
    id: `f${index}`,
    capturedAt: "2026-08-10T12:00:00.000Z",
    noteId: `n${index % 18}`,
    correctOnFirstCheck: index % 5 !== 0,
  }));
  const rhythmAttempts = [{
    id: "r1",
    capturedAt: "2026-08-10T12:00:00.000Z",
    hitCount: 64,
    medianAbsoluteErrorMs: 42,
  }];
  const rating = skill.calculateSkillRating({ schemaVersion: 1, tunerSessions, fingeringAttempts, rhythmAttempts });
  assert.equal(rating.status, "established");
  assert.ok(rating.rating >= 400 && rating.rating <= 2000);
  assert.equal(rating.confidence, 100);
  assert.equal(rating.formulaVersion, "BCR-1.0");
});
