import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "assets", "catalog.json"), "utf8"));

assert.equal(catalog.instrumentCount, 35);
assert.equal(catalog.instruments.length, 35);
assert.equal(new Set(catalog.instruments.map(item => item.id)).size, 35);
assert.equal(catalog.instruments.find(item => item.id === "alto-sax").transpose, -9);
assert.equal(catalog.instruments.find(item => item.id === "sopranino-sax").transpose, 3);
assert.equal(catalog.instruments.find(item => item.id === "soprillo-sax").transpose, 10);

for (const item of catalog.instruments) {
  const modelPath = path.join(root, "assets", "models", `${item.id}.glb`);
  const buffer = fs.readFileSync(modelPath);
  assert.equal(buffer.subarray(0, 4).toString(), "glTF", `${item.id}: GLB magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${item.id}: glTF version`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${item.id}: declared length`);
  const jsonLength = buffer.readUInt32LE(12);
  const doc = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const controls = doc.nodes.filter(node => node.extras?.interactive);
  assert.equal(controls.length, item.interactiveControls, `${item.id}: controls`);
}

assert.ok(fs.existsSync(path.join(dist, "index.html")), "dist/index.html missing; run npm run build");
assert.ok(fs.existsSync(path.join(dist, "bocal.js")), "dist/bocal.js missing");
assert.equal(fs.readdirSync(path.join(dist, "models")).filter(name => name.endsWith(".glb")).length, 35);
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
assert.match(html, /\.\/bocal\.js/);
assert.doesNotMatch(html, /chatgpt\.site|cloudflare|mobius/i);
const source = fs.readFileSync(path.join(root, "src", "app.ts"), "utf8");
for (const route of ["tune", "lab", "pulse", "sound", "analyze", "practice"]) assert.match(html, new RegExp(`data-view=["']${route}["']`));
assert.match(source, /routeTo\(location\.hash\.slice\(1\)\|\|"tune"\)/);

console.log(`Smoke checks passed: ${catalog.instrumentCount} instruments, 6 workspaces, static build present.`);
