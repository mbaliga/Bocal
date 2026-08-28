import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the app shell exposes a guitar tuner and learning studio", async () => {
  const page = await read("../app/page.tsx");
  const guitar = await read("../app/GuitarStudio.tsx");
  const data = await read("../app/guitar-data.ts");

  assert.match(page, /GuitarStudio/);
  assert.match(page, /instrumentId === "guitar"/);
  assert.match(guitar, /String tuner/);
  assert.match(guitar, /colour coded fingers/);
  assert.match(guitar, /Wait for correct root/);
  assert.match(data, /Drop D/);
  assert.match(data, /Open G/);
});

test("practice insights and song wishlist are evidence-based and local", async () => {
  const practice = await read("../app/PracticeTools.tsx");
  const data = await read("../app/practice-data.ts");

  assert.match(practice, /Practice map/);
  assert.match(practice, /Add a song to your wishlist/);
  assert.match(practice, /does not include unlicensed scores, tabs or audio/);
  assert.match(data, /PRACTICE_ACTIVITY_STORAGE_KEY/);
  assert.match(data, /addSongWish/);
});

test("the visual system keeps the mobile-derived arc dock on wide screens", async () => {
  const page = await read("../app/page.tsx");
  const css = await read("../app/globals.css");

  assert.match(page, /className="mobile-dock"/);
  assert.match(css, /\.mobile-nav button\.is-active/);
    assert.match(css, /@media \(orientation: landscape\) and \(min-width: 681px\)/);
  assert.match(css, /\.nav-right \.mobile-nav/);
});
