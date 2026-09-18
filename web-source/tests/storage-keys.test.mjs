// Guards the single-source-of-truth promise storage-keys.ts makes: every
// localStorage key literal Bocal writes has to resolve to one of its
// exported constants, so a typo in a second copy of the same string can't
// silently lose a player's saved setting.
//
// Scans every .ts/.tsx file under app/ for a literal string passed straight
// to localStorage.getItem/setItem/removeItem. A literal that isn't one of
// storage-keys.ts's exported values fails, unless that line carries a
// `TODO(storage-keys)` comment -- the escape hatch wave 2's shared
// conventions give another package for a key it added this wave and hasn't
// migrated yet. A key that's already a *named constant* somewhere other than
// storage-keys.ts (e.g. skill-rating.ts's SKILL_EVIDENCE_STORAGE_KEY, or a
// key private to a module this package doesn't own) isn't a literal at its
// call site, so it's naturally out of this test's scope -- consistent with
// "migrate the copies in your own files only" from the music-math item.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "../app");

async function listSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function knownStorageValues(storageKeysSource) {
  const values = new Set();
  for (const match of storageKeysSource.matchAll(/export const \w+ = "([^"]+)"/g)) {
    values.add(match[1]);
  }
  return values;
}

const CALL_PATTERN = /(?:window\.)?localStorage\.(getItem|setItem|removeItem)\(\s*(["'`][^"'`]+["'`])/g;

test("every localStorage call under app/ resolves to a storage-keys.ts constant", async () => {
  const storageKeysSource = await readFile(path.join(APP_DIR, "storage-keys.ts"), "utf8");
  const known = knownStorageValues(storageKeysSource);
  assert.ok(known.size >= 19, "storage-keys.ts should export the tuner's full set of keys");

  const files = await listSourceFiles(APP_DIR);
  const violations = [];

  for (const file of files) {
    const relative = path.relative(APP_DIR, file);
    if (relative === "storage-keys.ts") continue;
    const source = await readFile(file, "utf8");
    const lines = source.split("\n");

    for (const match of source.matchAll(CALL_PATTERN)) {
      const literal = match[2].slice(1, -1);
      // A `${...}` interpolation (layout.tsx's inlined bootstrap <script>
      // string is built this way, since it's shipped as text, not executed
      // as a module import) means this isn't a hardcoded literal at all.
      if (literal.includes("${")) continue;
      const upTo = source.slice(0, match.index).split("\n").length - 1;
      const lineText = lines[upTo] ?? "";
      const hasEscape = /TODO\(storage-keys\)/.test(lineText);
      if (!known.has(literal) && !hasEscape) {
        violations.push(`${relative}:${upTo + 1}: literal "${literal}" is not exported by storage-keys.ts`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("page.tsx and layout.tsx source every key they use from storage-keys.ts", async () => {
  const page = await readFile(path.join(APP_DIR, "page.tsx"), "utf8");
  const layout = await readFile(path.join(APP_DIR, "layout.tsx"), "utf8");
  assert.match(page, /from ["']\.\/storage-keys["']/);
  assert.match(layout, /from ["']\.\/storage-keys["']/);
  // No lingering bespoke `const X_STORAGE_KEY = "..."` re-declarations of a
  // key storage-keys.ts already exports.
  assert.doesNotMatch(page, /^const \w*STORAGE_KEY\w* = "bocal-/m);
});

test("AnalysisView only reads the tuning keys, read-only, through storage-keys.ts", async () => {
  const source = await readFile(path.join(APP_DIR, "AnalysisView.tsx"), "utf8");
  assert.match(source, /from ["']\.\/storage-keys["']/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
});

test("PulseView and PracticeTools import their storage keys rather than redeclaring them", async () => {
  const pulse = await readFile(path.join(APP_DIR, "PulseView.tsx"), "utf8");
  const practice = await readFile(path.join(APP_DIR, "PracticeTools.tsx"), "utf8");
  assert.match(pulse, /from ["']\.\/storage-keys["']/);
  assert.match(practice, /from ["']\.\/storage-keys["']/);
});
