#!/usr/bin/env node

/**
 * Documented recipe for turning a downloaded Sketchfab (or similar) GLB into
 * the optimized reference Bocal ships under public/models/. This replaces
 * scripts/isolate-glb-root.mjs, which only did the "isolate one root node"
 * step; the sax and oboe GLBs already in the repo were produced by an
 * equivalent manual pass with glTF-Transform (see git history and
 * ATTRIBUTION.md for what was actually done to each file). This script
 * automates the same steps for the *next* import (see docs/import-model.md)
 * without re-running against the shipped assets, since that would require
 * re-verifying both files visually and by licence before committing new
 * binaries.
 *
 * Usage:
 *   node scripts/optimize-model.mjs isolate <input.glb> <output.glb> <root-name>
 *   node scripts/optimize-model.mjs recipe
 *
 * `isolate` is the exact byte-preserving JSON-chunk edit the old script did
 * (kept as a subcommand for compatibility with any existing tooling that
 * calls it directly). `recipe` prints the full glTF-Transform CLI pipeline
 * used for a new import, so it can be run manually and the exact commands
 * recorded in ATTRIBUTION.md's "changes indicated" note, per CC BY 4.0
 * section 3(a)(1)(B).
 */

import { readFile, writeFile } from "node:fs/promises";

const RECIPE = `
# Bocal model optimization recipe (glTF-Transform v4.x CLI, "@gltf-transform/cli")
#
# 1. Isolate the scene root you actually want to ship, if the source file
#    bundles multiple finish trees or unrelated scenes (see \`isolate\` below).
#    Keep any material/texture you intend to use later (e.g. an alternate
#    finish texture) even if it is not referenced by the kept tree yet --
#    record that decision in ATTRIBUTION.md so a later \`prune\` doesn't
#    silently remove it.
#
# 2. Quantize geometry (smaller, integer-backed accessors):
#      gltf-transform quantize in.glb quantized.glb --quantize-position 14 --quantize-normal 10 --quantize-texcoord 12
#
# 3. Convert textures to WebP (skip if the model has no textures):
#      gltf-transform webp quantized.glb textured.glb --quality 82
#
# 4. Prune unused nodes/meshes/materials/accessors -- but first confirm
#    nothing you plan to use later (an alternate finish texture, a second
#    node tree) would be removed; if something must be kept, prune with
#    \`--keep-attributes\` / targeted node deletion instead of a blanket pass:
#      gltf-transform prune textured.glb final.glb
#
# 5. Verify: parse final.glb's JSON chunk (nodes/meshes/materials/accessor
#    counts, bbox per mesh from accessor min/max transformed by each node's
#    world matrix) and load it through tests/model-render.test.mjs's
#    normalisation replay before committing.
#
# 6. Add an ATTRIBUTION.md entry naming every step actually run (CC BY 4.0
#    requires indicating modifications), and a *.parts.json sidecar
#    classifying each mesh/group into body/keywork/etc. by name or hierarchy
#    (see saxophone-alto.parts.json and oboe-howarth-s20c.parts.json for the
#    two existing shapes: an explicit per-mesh table, or an ancestor rule).
`;

async function isolate(inputPath, outputPath, rootName) {
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
}

const [command, ...args] = process.argv.slice(2);

if (command === "isolate") {
  const [inputPath, outputPath, rootName] = args;
  if (!inputPath || !outputPath || !rootName) {
    throw new Error("Usage: node scripts/optimize-model.mjs isolate <input.glb> <output.glb> <root-name>");
  }
  await isolate(inputPath, outputPath, rootName);
} else if (command === "recipe" || !command) {
  console.log(RECIPE.trim());
} else {
  throw new Error(`Unknown command ${command}. Usage: isolate | recipe`);
}
