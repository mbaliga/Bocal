#!/usr/bin/env node
/** Record registry audit evidence. --enforce rejects any dependency finding.
 * Reporting mode is deliberately not a security acceptance decision. Network or
 * malformed-report errors fail in both modes, never masquerading as zero findings.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const enforce = process.argv.includes("--enforce");
const reportDir = path.resolve("../qa/reports");
mkdirSync(reportDir, { recursive: true });
const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024,
});
if (result.error || result.signal || result.status === null) {
  console.error("Dependency audit could not complete:", result.error?.message || result.signal);
  process.exit(2);
}
let report;
try { report = JSON.parse(result.stdout); }
catch { console.error("Dependency audit returned invalid JSON."); process.exit(2); }
writeFileSync(path.join(reportDir, "dependency-audit.json"), JSON.stringify(report, null, 2) + "\n");
if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) {
  console.error("Dependency audit is unavailable:", report.error?.message || "missing report fields");
  process.exit(2);
}
console.log("Dependency audit counts:", JSON.stringify(report.metadata.vulnerabilities));
for (const [name, finding] of Object.entries(report.vulnerabilities)) {
  console.log(JSON.stringify({ name, severity: finding.severity, direct: finding.isDirect,
    range: finding.range, fix: finding.fixAvailable, via: finding.via }));
}
const { low = 0, moderate = 0, high = 0, critical = 0 } = report.metadata.vulnerabilities;
const total = low + moderate + high + critical;
if (total > 0) {
  console.log(`SECURITY REVIEW REQUIRED: ${low} low, ${moderate} moderate, ${high} high, ${critical} critical findings. No release approval implied.`);
  if (enforce) process.exit(1);
}
