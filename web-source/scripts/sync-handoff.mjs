// Keeps the handoff served from Settings identical to the one in docs/.
// docs/BOCAL_HANDOFF.md is the only copy anyone edits; this runs before
// every build so the served file cannot drift (product-truth tests also
// assert the two are byte-identical).
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../docs/BOCAL_HANDOFF.md", import.meta.url));
const to = fileURLToPath(new URL("../public/downloads/BOCAL_HANDOFF.md", import.meta.url));
await mkdir(new URL("../public/downloads/", import.meta.url), { recursive: true });
await copyFile(from, to);
console.log("sync-handoff: public/downloads/BOCAL_HANDOFF.md refreshed from docs/");
