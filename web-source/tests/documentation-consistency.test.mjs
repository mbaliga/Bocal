import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (url) => readFile(new URL(url, import.meta.url), "utf8");

test("the published handoff and current-state page describe the current product", async () => {
  const [canonical, published, currentState] = await Promise.all([
    read("../../docs/BOCAL_HANDOFF.md"),
    read("../public/downloads/BOCAL_HANDOFF.md"),
    read("../../docs/CURRENT_STATE.md"),
  ]);

  assert.equal(published, canonical, "the downloadable handoff must match the canonical handoff");
  for (const staleClaim of [
    "review/",
    "PLAN.md",
    "single frequency range",
    "session/in-memory only",
    "uniform bronze study finish",
    "no per-instrument material/finish customization",
  ]) {
    assert.doesNotMatch(canonical, new RegExp(staleClaim.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `stale handoff claim: ${staleClaim}`);
  }

  assert.match(canonical, /IndexedDB/);
  assert.match(canonical, /npm run test:e2e/);
  assert.match(canonical, /npm run test:theme/);
  assert.match(currentState, /model-render\.test\.mjs/);
  assert.match(currentState, /IndexedDB-backed local persistence/);
});
