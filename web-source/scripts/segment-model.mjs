#!/usr/bin/env node

/**
 * Splits one fused mesh inside a shipped GLB into several primitives that
 * share the same vertex data (position/normal accessors) and the same
 * material, but each get their own index accessor -- so the part can be
 * targeted independently at runtime (its own Look finish, its own exploded-
 * view offset, its own neck-variant geometry nudge) without touching a
 * single vertex, UV or normal. No geometry is added, removed or moved; this
 * is purely a re-partition of which triangles belong to which node, which
 * is why it is safe under the CC BY licence as long as the change is
 * recorded (see ATTRIBUTION.md).
 *
 * Today this has one concrete recipe: the alto saxophone's `Object_2` mesh,
 * which fuses the neck tube, main body, bow (the U-turn) and bell into a
 * single primitive (see docs/import-model.md and
 * public/models/saxophone-alto.parts.json before this script ran). Splitting
 * it requires knowing which triangles are which -- there is no reliable
 * name or material signal (unlike the sax's already-separate mouthpiece/
 * ligature/keywork meshes), so this script classifies each triangle
 * geometrically:
 *
 *  1. Neck: any vertex with local Z above `--neck-z` (default 0.14). The
 *     mesh's Z histogram has a sharp density drop right at this value (a
 *     long, thin, low-poly crook tube below a much higher-poly mouthpiece
 *     receiver socket above it) -- see the "recipe" subcommand for the
 *     numbers this was picked from.
 *  2. Body / bow / bell: everything else (the "trunk") is walked with
 *     multi-source Dijkstra over the mesh's edge graph, seeded from the
 *     ring of trunk vertices adjacent to a neck vertex (the tenon boundary).
 *     This gives every trunk vertex a geodesic distance along the tube's
 *     surface from the tenon -- which orders body -> bow -> bell correctly
 *     even though the bow folds the tube back on itself in plain X/Y/Z
 *     (a fixed-axis threshold cannot separate them; the body and bell tubes
 *     sit at overlapping world coordinates, just at different points along
 *     the surface). `--body-frac` / `--bow-frac` (default 0.30 / 0.65) cut
 *     that normalised geodesic distance into the three bands; the defaults
 *     were picked from where the per-segment turning angle along the
 *     geodesic path rises into a sustained bend (the bow) and falls back to
 *     a gentle, opening curve (the bell). A handful of vertices sit on a
 *     second, disconnected sheet near the bow (an inner-bore duplicate --
 *     252 of the mesh's 1960 trunk vertices); those inherit their nearest
 *     reached neighbour's label by straight-line distance.
 *  3. Each triangle takes the majority label of its three vertices.
 *
 * Pads (a "pads" group extracted from the sax's keywork mesh, `Object_3`)
 * were investigated for wave 2 and are NOT shipped. `Object_3` fuses touches,
 * rods, springs, cups and pads into one 30,246-vertex primitive with 137
 * disconnected sub-components by mesh adjacency (sizes from ~700 vertices
 * down to 4-16-vertex screws/springs) and a single shared material -- unlike
 * Object_2's single continuous tube surface, there is no name, material or
 * reliable component-boundary signal isolating a pad from the cup it is
 * welded to (a pad is very likely fused into the same connected piece as
 * its cup, not its own component at all). Separating them reliably would
 * need per-face curvature/shape classification across all 137 pieces to
 * find each cup's inward-facing disc -- a much harder, multi-day problem
 * than either recipe below, and it was not attempted further within the
 * time available. Ship nothing here rather than an approximate pads group.
 *
 * A second, much simpler recipe, `axis-split`, splits any single-primitive
 * mesh into N parts by a straight-line threshold on one local axis -- for
 * the oboe's `Oboe_Base_My_Oboe_0` (a nearly-straight tube, unlike the
 * sax's folded body), the per-vertex radius from the tube's centreline
 * drops to exactly zero in two narrow Y bands (real gaps in the mesh, not
 * just low density -- see the "recipe-oboe" subcommand), which are the
 * top-joint/lower-joint and lower-joint/bell seams.
 *
 * Usage:
 *   node scripts/segment-model.mjs sax-body <input.glb> <output.glb> [options]
 *   node scripts/segment-model.mjs axis-split <input.glb> <output.glb> --node <name> --axis y --thresholds <n,n,...> --names <a,b,c,...>
 *   node scripts/segment-model.mjs recipe
 *   node scripts/segment-model.mjs recipe-oboe
 *
 * Options (sax-body):
 *   --node <name>       Node to split (default Object_2)
 *   --neck-z <n>         Local-space Z threshold for the neck (default 0.14)
 *   --body-frac <n>      Geodesic fraction where body ends / bow starts (default 0.30)
 *   --bow-frac <n>       Geodesic fraction where bow ends / bell starts (default 0.65)
 *
 * Options (axis-split): --thresholds is N-1 ascending values splitting the
 * axis into N bands; --names has N comma-separated part-name suffixes, one
 * per band, in ascending-axis order.
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const RECIPE = `
# Bocal saxophone body re-segmentation (glTF-Transform v4 Document API)
#
# Object_2 fuses the neck tube, body, bow and bell of the alto sax into one
# primitive (2940 vertices / 5768 triangles). Investigation (see this
# script's header) found:
#
#  - A sharp density drop in the local-Z triangle histogram at Z ~ 0.14:
#    below it, ~100-230 triangles per 0.04-wide Z band (the thicker body/
#    bow/bell); above it, ~56-98 per band until Z ~ 0.90 (the thin neck
#    crook), then a spike to ~330 (the mouthpiece receiver socket).
#    -> neck = Z > 0.14.
#  - Below that, the "trunk" (1960 vertices) splits into two connected
#    components by mesh adjacency: 1708 vertices reachable from the tenon
#    boundary ring (the outer tube surface -- body, bow, bell) and 252 on a
#    separate sheet confined to the bow's Y/Z range (an inner-bore rib or
#    duplicate). The 252 inherit their nearest outer-surface neighbour's
#    label.
#  - Multi-source Dijkstra (edge-length-weighted BFS) from the tenon ring
#    gives every reachable trunk vertex a geodesic distance along the tube
#    surface. Binning that path into 40 steps and measuring the turning
#    angle between consecutive steps: turning stays under ~1 degree for the
#    first ~30% of the path (the straight body), rises to 20-62 degrees
#    through the next ~35% (the bow's tight U), then settles back under
#    ~20 degrees with a gentle outward drift for the remainder (the bell's
#    flare to its rim, the single farthest point from the tenon by this
#    measure).
#    -> body = geodesic fraction < 0.30, bow = 0.30-0.65, bell > 0.65.
#
# Each triangle takes the majority vertex label; the four resulting
# primitives share the original POSITION/NORMAL accessors (no vertex is
# duplicated, moved, or re-quantized) and the original material. Run:
#
#   node scripts/segment-model.mjs sax-body public/models/saxophone-alto.glb /tmp/out.glb
#
# then verify with tests/model-render.test.mjs's normalisation replay and a
# visual pixel-diff of each new Look option before committing the output
# over the shipped file, and record the change in ATTRIBUTION.md (CC BY 4.0
# requires indicating modifications).
`;

function dist3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Classify every vertex of a fused tube mesh into neck / body / bow / bell.
 * `positions` is an array of [x,y,z] (already dequantized). `indices` is a
 * flat triangle index array. Returns a Uint8Array of labels (0 neck, 1 body,
 * 2 bow, 3 bell) and diagnostic info for the recipe log.
 */
export function classifyTubeVertices(positions, indices, { neckZ, bodyFrac, bowFrac }) {
  const n = positions.length;
  const isNeck = new Uint8Array(n);
  for (let v = 0; v < n; v++) isNeck[v] = positions[v][2] > neckZ ? 1 : 0;

  const adjacency = Array.from({ length: n }, () => new Set());
  const triCount = indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    adjacency[ia].add(ib); adjacency[ib].add(ia);
    adjacency[ib].add(ic); adjacency[ic].add(ib);
    adjacency[ic].add(ia); adjacency[ia].add(ic);
  }

  let seeds = [];
  for (let v = 0; v < n; v++) {
    if (isNeck[v]) continue;
    for (const w of adjacency[v]) {
      if (isNeck[w]) { seeds.push(v); break; }
    }
  }
  if (seeds.length === 0) {
    const trunk = [];
    for (let v = 0; v < n; v++) if (!isNeck[v]) trunk.push(v);
    trunk.sort((a, b) => positions[b][2] - positions[a][2]);
    seeds = trunk.slice(0, Math.max(1, Math.floor(trunk.length * 0.02)));
  }

  const INF = Infinity;
  const geo = new Float64Array(n).fill(INF);
  const visited = new Uint8Array(n);
  const queue = [];
  for (const s of seeds) { geo[s] = 0; queue.push(s); }
  while (queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (geo[queue[i]] < geo[queue[best]]) best = i;
    const u = queue.splice(best, 1)[0];
    if (visited[u]) continue;
    visited[u] = 1;
    for (const w of adjacency[u]) {
      if (isNeck[w]) continue;
      const d = geo[u] + dist3(positions[u], positions[w]);
      if (d < geo[w]) { geo[w] = d; queue.push(w); }
    }
  }

  let maxGeo = 0;
  for (let v = 0; v < n; v++) if (!isNeck[v] && geo[v] < INF && geo[v] > maxGeo) maxGeo = geo[v];

  // label: 0 neck, 1 body, 2 bow, 3 bell
  const label = new Uint8Array(n);
  const reached = [];
  for (let v = 0; v < n; v++) {
    if (isNeck[v]) { label[v] = 0; continue; }
    if (geo[v] === INF) continue; // resolved in the second pass below
    const frac = maxGeo > 0 ? geo[v] / maxGeo : 0;
    label[v] = frac < bodyFrac ? 1 : frac < bowFrac ? 2 : 3;
    reached.push(v);
  }
  // Disconnected trunk fragments (e.g. an inner-bore sheet near the bow)
  // inherit the label of their nearest reached vertex by straight-line
  // distance -- they have no path to the tenon through the mesh graph, but
  // they are physically co-located with one of the three regions.
  for (let v = 0; v < n; v++) {
    if (isNeck[v] || geo[v] !== INF) continue;
    let bestV = -1, bestD = Infinity;
    for (const r of reached) {
      const d = dist3(positions[v], positions[r]);
      if (d < bestD) { bestD = d; bestV = r; }
    }
    label[v] = bestV >= 0 ? label[bestV] : 1;
  }

  return { label, maxGeo, seedCount: seeds.length };
}

const RECIPE_OBOE = `
# Bocal oboe body split (glTF-Transform v4 Document API)
#
# Oboe_Base_My_Oboe_0 (7182 vertices, one primitive) is the whole wooden
# body -- top joint, lower joint and bell -- fused together, local Y from
# -1 (bell) to +1 (top joint, narrowing toward the reed-staple receiver).
# Measuring each vertex's radius from the tube's centreline
# (sqrt(x^2 + z^2)) in 40 Y-bins found the radius drops to *exactly* zero
# (no vertices at all, not just few) in two narrow bands: Y in [-0.9,-0.8]
# and Y in [0.6,0.7] -- genuine gaps in the mesh, i.e. real modelled seams,
# not merely low-density regions. Splitting there:
#
#   node scripts/segment-model.mjs axis-split public/models/oboe-howarth-s20c.glb /tmp/out.glb \\
#     --node Oboe_Base_My_Oboe_0 --axis y --thresholds -0.85,0.65 --names bell,lower_joint,top_joint
#
# gives bell (Y < -0.85), lower_joint (-0.85 to 0.65) and top_joint
# (Y > 0.65), each its own primitive sharing the original POSITION/NORMAL
# accessors and material -- so the exploded view can separate the two
# joints, and a small procedural cork/tenon ring can be drawn at each seam
# (see ImportedInstrumentCanvas.tsx) without touching the licensed mesh.
`;

const PART_NAMES = ["neck", "body", "bow", "bell"];

async function segmentSaxBody(inputPath, outputPath, opts) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(inputPath);
  const root = document.getRoot();

  const node = root.listNodes().find((n) => n.getName() === opts.node);
  if (!node) throw new Error(`Node ${opts.node} not found.`);
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`Node ${opts.node} has no mesh.`);
  const primitives = mesh.listPrimitives();
  if (primitives.length !== 1) throw new Error(`Expected exactly one primitive on ${opts.node}, found ${primitives.length}.`);
  const primitive = primitives[0];

  const positionAccessor = primitive.getAttribute("POSITION");
  const normalAccessor = primitive.getAttribute("NORMAL");
  const indexAccessor = primitive.getIndices();
  const material = primitive.getMaterial();
  if (!positionAccessor || !indexAccessor) throw new Error(`${opts.node}'s primitive is missing POSITION or indices.`);

  const vertexCount = positionAccessor.getCount();
  const positions = new Array(vertexCount);
  const tmp = [0, 0, 0];
  for (let v = 0; v < vertexCount; v++) {
    positionAccessor.getElement(v, tmp);
    positions[v] = [tmp[0], tmp[1], tmp[2]];
  }

  const triCount = indexAccessor.getCount() / 3;
  const indices = new Uint32Array(indexAccessor.getCount());
  for (let i = 0; i < indices.length; i++) indices[i] = indexAccessor.getScalar(i);

  const { label, maxGeo, seedCount } = classifyTubeVertices(positions, indices, {
    neckZ: opts.neckZ,
    bodyFrac: opts.bodyFrac,
    bowFrac: opts.bowFrac,
  });

  const triLabel = new Uint8Array(triCount);
  const partTriangles = [[], [], [], []];
  for (let t = 0; t < triCount; t++) {
    const a = label[indices[t * 3]], b = label[indices[t * 3 + 1]], c = label[indices[t * 3 + 2]];
    // majority vote; an all-different triangle (rare, a boundary sliver)
    // takes the middle-ranked label so it lands with its nearer neighbour
    // rather than always defaulting to one part.
    let part;
    if (a === b || a === c) part = a;
    else if (b === c) part = b;
    else part = [a, b, c].sort((x, y) => x - y)[1];
    triLabel[t] = part;
    partTriangles[part].push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
  }

  const parent = node.getParentNode();
  if (!parent) throw new Error(`${opts.node} has no parent node to attach siblings to.`);
  const scale = node.getScale();
  const translation = node.getTranslation();
  const rotation = node.getRotation();

  const counts = {};
  for (let part = 0; part < 4; part++) {
    const triIndices = partTriangles[part];
    if (triIndices.length === 0) continue;
    const name = `${opts.node}_${PART_NAMES[part]}`;
    counts[name] = triIndices.length / 3;

    const newIndexAccessor = document
      .createAccessor(`${name}_indices`)
      .setType("SCALAR")
      .setArray(new Uint16Array(triIndices));

    const newPrimitive = document.createPrimitive().setAttribute("POSITION", positionAccessor).setIndices(newIndexAccessor);
    if (normalAccessor) newPrimitive.setAttribute("NORMAL", normalAccessor);
    if (material) newPrimitive.setMaterial(material);

    const newMesh = document.createMesh(name).addPrimitive(newPrimitive);
    const newNode = document.createNode(name).setMesh(newMesh).setScale(scale).setTranslation(translation).setRotation(rotation);
    parent.addChild(newNode);
  }

  node.setMesh(null);
  parent.removeChild(node);
  node.dispose();
  mesh.dispose();
  primitive.dispose();
  // The old index accessor is now unreferenced (the new per-part index
  // accessors replace it) -- dispose it explicitly so NodeIO.write doesn't
  // still emit its dead bytes; POSITION/NORMAL stay (the new primitives
  // reference them).
  indexAccessor.dispose();

  await io.write(outputPath, document);
  return { counts, maxGeo, seedCount, triCount };
}

async function axisSplit(inputPath, outputPath, opts) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(inputPath);
  const root = document.getRoot();

  const node = root.listNodes().find((n) => n.getName() === opts.node);
  if (!node) throw new Error(`Node ${opts.node} not found.`);
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`Node ${opts.node} has no mesh.`);
  const primitives = mesh.listPrimitives();
  if (primitives.length !== 1) throw new Error(`Expected exactly one primitive on ${opts.node}, found ${primitives.length}.`);
  const primitive = primitives[0];

  const positionAccessor = primitive.getAttribute("POSITION");
  const normalAccessor = primitive.getAttribute("NORMAL");
  const indexAccessor = primitive.getIndices();
  const material = primitive.getMaterial();
  if (!positionAccessor || !indexAccessor) throw new Error(`${opts.node}'s primitive is missing POSITION or indices.`);

  const axisIndex = { x: 0, y: 1, z: 2 }[opts.axis];
  const vertexCount = positionAccessor.getCount();
  const axisValues = new Float32Array(vertexCount);
  const tmp = [0, 0, 0];
  for (let v = 0; v < vertexCount; v++) {
    positionAccessor.getElement(v, tmp);
    axisValues[v] = tmp[axisIndex];
  }

  function bandOf(value) {
    for (let i = 0; i < opts.thresholds.length; i++) if (value < opts.thresholds[i]) return i;
    return opts.thresholds.length;
  }

  const triCount = indexAccessor.getCount() / 3;
  const indices = new Uint32Array(indexAccessor.getCount());
  for (let i = 0; i < indices.length; i++) indices[i] = indexAccessor.getScalar(i);

  const partTriangles = opts.names.map(() => []);
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    const bands = [bandOf(axisValues[ia]), bandOf(axisValues[ib]), bandOf(axisValues[ic])];
    let band;
    if (bands[0] === bands[1] || bands[0] === bands[2]) band = bands[0];
    else if (bands[1] === bands[2]) band = bands[1];
    else band = [...bands].sort((x, y) => x - y)[1];
    partTriangles[band].push(ia, ib, ic);
  }

  const parent = node.getParentNode();
  if (!parent) throw new Error(`${opts.node} has no parent node to attach siblings to.`);
  const scale = node.getScale();
  const translation = node.getTranslation();
  const rotation = node.getRotation();

  const counts = {};
  for (let band = 0; band < opts.names.length; band++) {
    const triIndices = partTriangles[band];
    if (triIndices.length === 0) continue;
    const name = `${opts.node}_${opts.names[band]}`;
    counts[name] = triIndices.length / 3;

    const newIndexAccessor = document
      .createAccessor(`${name}_indices`)
      .setType("SCALAR")
      .setArray(new Uint16Array(triIndices));

    const newPrimitive = document.createPrimitive().setAttribute("POSITION", positionAccessor).setIndices(newIndexAccessor);
    if (normalAccessor) newPrimitive.setAttribute("NORMAL", normalAccessor);
    if (material) newPrimitive.setMaterial(material);

    const newMesh = document.createMesh(name).addPrimitive(newPrimitive);
    const newNode = document.createNode(name).setMesh(newMesh).setScale(scale).setTranslation(translation).setRotation(rotation);
    parent.addChild(newNode);
  }

  node.setMesh(null);
  parent.removeChild(node);
  node.dispose();
  mesh.dispose();
  primitive.dispose();
  // The old index accessor is now unreferenced (the new per-part index
  // accessors replace it) -- dispose it explicitly so NodeIO.write doesn't
  // still emit its dead bytes; POSITION/NORMAL stay (the new primitives
  // reference them).
  indexAccessor.dispose();

  await io.write(outputPath, document);
  return { counts, triCount };
}

// Only run the CLI when this file is executed directly (`node
// scripts/segment-model.mjs ...`), not when imported as a module (tests
// import classifyTubeVertices from it, and must not trigger CLI output or
// a real file read/write as a side effect of that import).
const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;

if (isMain) {
  await runCli();
}

async function runCli() {
const [command, ...args] = process.argv.slice(2);

if (command === "sax-body") {
  const [inputPath, outputPath, ...rest] = args;
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node scripts/segment-model.mjs sax-body <input.glb> <output.glb> [--node name] [--neck-z n] [--body-frac n] [--bow-frac n]");
  }
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, "")] = rest[i + 1];
  const opts = {
    node: flags.node ?? "Object_2",
    neckZ: flags["neck-z"] !== undefined ? Number(flags["neck-z"]) : 0.14,
    bodyFrac: flags["body-frac"] !== undefined ? Number(flags["body-frac"]) : 0.3,
    bowFrac: flags["bow-frac"] !== undefined ? Number(flags["bow-frac"]) : 0.65,
  };
  const result = await segmentSaxBody(inputPath, outputPath, opts);
  console.log(`Segmented ${opts.node} (${result.triCount} triangles, tenon seed ring ${result.seedCount} vertices, max geodesic distance ${result.maxGeo.toFixed(3)}) into:`);
  for (const [name, count] of Object.entries(result.counts)) console.log(`  ${name}: ${count} triangles`);
} else if (command === "axis-split") {
  const [inputPath, outputPath, ...rest] = args;
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node scripts/segment-model.mjs axis-split <input.glb> <output.glb> --node name --axis x|y|z --thresholds n,n,... --names a,b,c,...");
  }
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, "")] = rest[i + 1];
  if (!flags.node || !flags.axis || !flags.thresholds || !flags.names) {
    throw new Error("axis-split requires --node, --axis, --thresholds and --names.");
  }
  const opts = {
    node: flags.node,
    axis: flags.axis,
    thresholds: flags.thresholds.split(",").map(Number),
    names: flags.names.split(","),
  };
  if (opts.names.length !== opts.thresholds.length + 1) throw new Error("--names must have exactly one more entry than --thresholds.");
  const result = await axisSplit(inputPath, outputPath, opts);
  console.log(`Split ${opts.node} (${result.triCount} triangles) by ${opts.axis} at [${opts.thresholds.join(", ")}] into:`);
  for (const [name, count] of Object.entries(result.counts)) console.log(`  ${name}: ${count} triangles`);
} else if (command === "recipe" || !command) {
  console.log(RECIPE.trim());
} else if (command === "recipe-oboe") {
  console.log(RECIPE_OBOE.trim());
} else {
  throw new Error(`Unknown command ${command}. Usage: sax-body | axis-split | recipe | recipe-oboe`);
}
}
