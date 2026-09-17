#!/usr/bin/env node
// Proves the standalone bundle (preview-dist/index.html) actually parses on
// the WebView floor without needing an old browser to test in.
//
// The Android shell loads this bundle inside a WebView that, on a device
// that never got its WebView updated, can still be as old as Chrome 69 --
// the exact version the API 26 "google_apis" emulator image ships (see
// android/app/src/main/java/com/bocal/music/WebViewFloor.kt and
// vite.preview.config.ts, which sets `build.target: ["chrome69"]`).
//
// Two checks:
//   1. Every inline <script> in the built HTML must (a) parse as valid
//      JavaScript at all -- a real syntax error, unrelated to the WebView
//      floor, still has to fail the build -- and (b) contain none of the
//      specific AST node shapes that mean "Chrome 69 cannot run this":
//      optional chaining (?.), nullish coalescing (?? and ??=), class
//      fields, private fields/methods, and numeric separators. esbuild's
//      `target: ["chrome69"]` (vite.preview.config.ts) is supposed to
//      lower all of these away; if a Vite/esbuild upgrade, a config
//      regression, or a hand-written script tag ever reintroduces one,
//      this fails loudly instead of shipping a bundle that throws
//      `Uncaught SyntaxError: Unexpected token ?` on first paint, as CI's
//      API 26 emulator observed before this fix.
//
//      This is deliberately an AST walk over a parse at a *current*
//      ecmaVersion, not a parse at some old ecmaVersion number picked to
//      match "Chrome 69": acorn gates syntax support by ECMAScript spec
//      year, not by browser version, and several spec-year-labelled
//      features shipped in Chrome well before their nominal year --
//      optional catch binding (`catch {}`, ES2019, Chrome 66), dynamic
//      `import()` (ES2020, Chrome 63) and `import.meta` (ES2020, Chrome
//      64) all already run fine on Chrome 69 and all appear in this
//      bundle (React's own output uses `catch {}`; app/page.tsx lazily
//      imports SaxophoneLab). Parsing at a low ecmaVersion number would
//      reject that legitimate, already-safe syntax as a false positive
//      having nothing to do with the floor -- so instead this parses at
//      the newest syntax acorn understands (which cannot itself produce a
//      false failure, since it accepts a superset) and inspects the AST
//      for the handful of node shapes that are the actual problem.
//   2. The bundle is grepped for runtime (not syntax) APIs the floor
//      lacks. esbuild's `target` only lowers *syntax*; it does not
//      polyfill missing globals or methods, so those have to be avoided
//      or shimmed by hand and are tracked here so a regression is caught
//      at build time instead of on a real old device.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const webSourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(webSourceRoot, "preview-dist", "index.html");
const html = readFileSync(htmlPath, "utf8");

// --- 1. Inline <script> syntax: parses at all, and no ES2020+ node shapes ---

/** Node types/shapes that mean "esbuild did not lower this for chrome69". */
function findModernSyntax(root) {
  const found = [];
  const seen = new Set();
  function visit(node) {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if (typeof node.type !== "string") {
      for (const key in node) visit(node[key]);
      return;
    }
    seen.add(node);
    switch (node.type) {
      case "MemberExpression":
      case "CallExpression":
        if (node.optional) found.push({ what: "optional chaining (?.)", node });
        break;
      case "LogicalExpression":
        if (node.operator === "??") found.push({ what: "nullish coalescing (??)", node });
        break;
      case "AssignmentExpression":
        if (node.operator === "??=") found.push({ what: "logical assignment (??=)", node });
        break;
      case "PropertyDefinition":
        found.push({ what: "class field declaration", node });
        break;
      case "PrivateIdentifier":
        found.push({ what: "private class field/method (#name)", node });
        break;
      case "Literal":
        if (typeof node.value === "number" && typeof node.raw === "string" && node.raw.includes("_")) {
          found.push({ what: "numeric separator (1_000)", node });
        }
        break;
      default:
        break;
    }
    for (const key in node) {
      if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
      visit(node[key]);
    }
  }
  visit(root);
  return found;
}

const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let scriptCount = 0;
let match;
while ((match = SCRIPT_RE.exec(html))) {
  const attrs = match[1];
  const body = match[2];
  if (/\bsrc\s*=/.test(attrs)) continue; // external script, nothing inlined to check
  if (!body.trim()) continue;
  scriptCount += 1;
  const sourceType = /\btype\s*=\s*["']module["']/.test(attrs) ? "module" : "script";
  let ast;
  try {
    ast = parse(body, { ecmaVersion: "latest", sourceType, allowHashBang: true });
  } catch (error) {
    console.error(`check-bundle-syntax: inline <script${attrs}> is not valid JavaScript:`);
    console.error(`  ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  const modernSyntax = findModernSyntax(ast);
  if (modernSyntax.length > 0) {
    const byKind = new Map();
    for (const { what } of modernSyntax) byKind.set(what, (byKind.get(what) ?? 0) + 1);
    console.error(`check-bundle-syntax: inline <script${attrs}> still contains syntax Chrome 69 cannot parse:`);
    for (const [what, count] of byKind) console.error(`  ${what}: ${count} occurrence(s)`);
    process.exitCode = 1;
  }
}
if (scriptCount === 0) {
  console.error("check-bundle-syntax: found no inline <script> content to check -- is the build broken?");
  process.exitCode = 1;
} else if (process.exitCode !== 1) {
  console.log(`check-bundle-syntax: ${scriptCount} inline <script> block(s) are valid JS with no ES2020+ node shapes left unlowered.`);
}

// --- 2. Runtime APIs the floor (Chrome 69) does not provide ---
//
// `shimmed: true` means we've verified the app only reaches this API behind
// a guard (optional chaining collapses to an explicit null-check once
// esbuild lowers it, so it can't be re-detected by grepping the *built*
// output -- the guard is verified by hand against app source instead) or a
// same-file runtime shim. A regex match for a `shimmed: false` entry means
// unguarded app or dependency code newly started calling an API the floor
// doesn't have, and the check fails so it gets fixed or shimmed before it
// ships.
const RUNTIME_API_CHECKS = [
  {
    name: "String.prototype.replaceAll (Chrome 85)",
    pattern: /\.replaceAll\(/,
    shimmed: false,
  },
  {
    name: "Array.prototype.at, index form (Chrome 92)",
    // Deliberately narrow: three.js ships unrelated two-argument `.at(t, target)`
    // methods (Ray/Line3/Plane/Box3) with the same name, which are not the
    // built-in and must not trip this check.
    pattern: /\.at\(\s*-?\d+\s*\)/,
    shimmed: false,
  },
  {
    name: "Object.hasOwn (Chrome 93)",
    pattern: /Object\.hasOwn\(/,
    shimmed: false,
  },
  {
    name: "Promise.allSettled (Chrome 76)",
    pattern: /Promise\.allSettled\(/,
    shimmed: false,
  },
  {
    name: "Promise.any (Chrome 85)",
    pattern: /Promise\.any\(/,
    shimmed: false,
  },
  {
    name: "structuredClone (Chrome 98)",
    pattern: /\bstructuredClone\(/,
    shimmed: false,
  },
  {
    name: "Array.prototype.findLast (Chrome 97)",
    pattern: /\.findLast\(/,
    shimmed: false,
  },
  {
    name: "Array.prototype.toSorted (Chrome 110)",
    pattern: /\.toSorted\(/,
    shimmed: false,
  },
  {
    name: "crypto.randomUUID (Chrome 92)",
    pattern: /\.randomUUID\(/,
    shimmed: true,
    note: "app/take-policy.ts calls it via `globalThis.crypto?.randomUUID?.()` with a Date.now()/Math.random() fallback -- safe when absent.",
  },
  {
    name: "AbortSignal.timeout (Chrome 103)",
    pattern: /AbortSignal\.timeout\(/,
    shimmed: false,
  },
  {
    name: "AbortSignal.any (Chrome 116)",
    pattern: /AbortSignal\.any\(/,
    shimmed: true,
    note: "dependency code guards every call with `typeof AbortSignal.any === \"function\"`; AbortSignal itself has existed since Chrome 66, so the property read cannot throw.",
  },
  {
    name: "Element.replaceChildren (Chrome 86)",
    pattern: /\.replaceChildren\(/,
    shimmed: false,
  },
  {
    name: "globalThis (Chrome 71)",
    pattern: /\bglobalThis\b/,
    shimmed: true,
    note: "preview/index.html defines `window.globalThis = window` in a classic <head> script that runs before the deferred module script.",
    // Belt and suspenders: if `globalThis` is referenced anywhere, the shim
    // that makes referencing it safe below Chrome 71 must also be present.
    require: {
      pattern: /window\.globalThis\s*=\s*window/,
      failureMessage: "`globalThis` is used but the window.globalThis shim (preview/index.html) is missing from the built bundle.",
    },
  },
];

let anyRuntimeFailure = false;
for (const check of RUNTIME_API_CHECKS) {
  const found = check.pattern.test(html);
  if (!found) continue;
  if (!check.shimmed) {
    console.error(`check-bundle-syntax: found unguarded use of ${check.name}, which the WebView floor (Chrome 69) does not provide.`);
    anyRuntimeFailure = true;
    continue;
  }
  if (check.require && !check.require.pattern.test(html)) {
    console.error(`check-bundle-syntax: ${check.require.failureMessage}`);
    anyRuntimeFailure = true;
    continue;
  }
  console.log(`check-bundle-syntax: ${check.name} is present and shimmed/guarded (${check.note})`);
}
if (anyRuntimeFailure) process.exitCode = 1;

if (process.exitCode === 1) {
  console.error("check-bundle-syntax: FAILED -- see above.");
} else {
  console.log("check-bundle-syntax: PASSED.");
}
