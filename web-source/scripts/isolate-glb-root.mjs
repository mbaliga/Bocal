#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath, rootName] = process.argv.slice(2);

if (!inputPath || !outputPath || !rootName) {
  throw new Error("Usage: node scripts/isolate-glb-root.mjs <input.glb> <output.glb> <root-name>");
}

const source = await readFile(inputPath);
if (source.toString("ascii", 0, 4) !== "glTF" || source.readUInt32LE(4) !== 2) {
  throw new Error(`${inputPath} is not a binary glTF 2.0 file.`);
}

const jsonLength = source.readUInt32LE(12);
const jsonType = source.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error("The first GLB chunk is not JSON.");

const jsonOffset = 20;
const document = JSON.parse(source.subarray(jsonOffset, jsonOffset + jsonLength).toString("utf8"));
const targetIndex = document.nodes.findIndex((node) => node.name === rootName);
if (targetIndex < 0) throw new Error(`Node ${rootName} was not found.`);

const parentIndex = document.nodes.findIndex((node) => node.children?.includes(targetIndex));
if (parentIndex < 0) throw new Error(`Node ${rootName} has no parent to isolate.`);

const siblings = document.nodes[parentIndex].children;
document.nodes[parentIndex].children = [targetIndex];

const encoded = Buffer.from(JSON.stringify(document));
if (encoded.length > jsonLength) throw new Error("Updated JSON no longer fits the existing GLB chunk.");

const output = Buffer.from(source);
output.fill(0x20, jsonOffset, jsonOffset + jsonLength);
encoded.copy(output, jsonOffset);
await writeFile(outputPath, output);

console.log(`Isolated ${rootName} (${targetIndex}) from ${siblings.length} sibling roots in ${outputPath}.`);
