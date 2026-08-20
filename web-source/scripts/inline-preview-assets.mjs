#!/usr/bin/env node
// Post-processes preview-dist/index.html for the standalone on-device build:
// the app references public assets by absolute path — url(/images/...) in the
// CSS, "/images/..." strings in JSX, and "/models/*.glb" props fed to
// GLTFLoader — which a served site resolves at request time. The standalone
// preview has no server, so every such reference is substituted for a base64
// data URI (three's FileLoader fetches, and fetch accepts data: URIs). Plain
// substring replacement of "/images/NAME" and "/models/NAME" covers CSS
// url(), double/single-quoted JS strings and template literals alike, since
// base64 data URIs contain none of the delimiters those contexts reserve.
// Fails loudly if any /images/ or /models/ reference survives, so a silently
// broken asset can't ship. /downloads/ links are left alone — the APK
// download can 404 in an offline preview by design.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webSourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(webSourceRoot, "preview-dist", "index.html");

const SOURCES = [
  { dir: path.join(webSourceRoot, "public", "images"), prefix: "/images/", mime: { ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" } },
  { dir: path.join(webSourceRoot, "public", "models"), prefix: "/models/", mime: { ".glb": "model/gltf-binary" } },
];

let html = readFileSync(htmlPath, "utf8");
let count = 0;

for (const { dir, prefix, mime } of SOURCES) {
  for (const name of readdirSync(dir)) {
    const ext = path.extname(name).toLowerCase();
    const type = mime[ext];
    if (!type) continue;
    const ref = `${prefix}${name}`;
    if (!html.includes(ref)) continue;
    const b64 = readFileSync(path.join(dir, name)).toString("base64");
    html = html.replaceAll(ref, `data:${type};base64,${b64}`);
    count += 1;
  }
}

const leftovers = [...new Set([...(html.match(/[("'`]\/(?:images|models)\/[^"'`)\s]+/g) ?? [])])];
if (leftovers.length) {
  throw new Error(`inline-preview-assets: unresolved asset refs remain: ${leftovers.join(", ")}`);
}

writeFileSync(htmlPath, html);
console.log(`inline-preview-assets: inlined ${count} asset(s) into ${path.relative(process.cwd(), htmlPath)}`);
