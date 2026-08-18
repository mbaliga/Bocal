#!/usr/bin/env node
// Post-processes preview-dist/index.html: globals.css references the seven
// cinematic instrument photos via absolute paths (url(/images/...)), which
// Vite deliberately leaves untouched at build time — those are meant to be
// served by a real server at request time. The standalone preview has no
// server, so this substitutes each one for a base64 data URI read straight
// from public/images/. See preview/README.md.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webSourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(webSourceRoot, "preview-dist", "index.html");
const imgDir = path.join(webSourceRoot, "public", "images");

let html = readFileSync(htmlPath, "utf8");
let count = 0;

for (const name of readdirSync(imgDir)) {
  if (!name.endsWith(".webp")) continue;
  const pattern = `url(/images/${name})`;
  if (!html.includes(pattern)) {
    console.warn(`inline-preview-images: no reference found for ${name}, skipping`);
    continue;
  }
  const b64 = readFileSync(path.join(imgDir, name)).toString("base64");
  html = html.replaceAll(pattern, `url(data:image/webp;base64,${b64})`);
  count += 1;
}

const remaining = html.match(/url\(\/[^)]*\)/g);
if (remaining) {
  throw new Error(`inline-preview-images: unresolved absolute url() refs remain: ${remaining.join(", ")}`);
}

writeFileSync(htmlPath, html);
console.log(`inline-preview-images: inlined ${count} image(s) into ${path.relative(process.cwd(), htmlPath)}`);
