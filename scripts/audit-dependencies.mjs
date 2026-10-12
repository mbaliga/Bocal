#!/usr/bin/env node
/** Record registry audit evidence. --enforce rejects any dependency finding that is
 * not covered by an unexpired entry in scripts/audit-allowlist.json.
 * Reporting mode is deliberately not a security acceptance decision. Network or
 * malformed-report errors fail in both modes, never masquerading as zero findings.
 *
 * Allowlist: scripts/audit-allowlist.json holds advisory IDs (GHSA-...) with a one-line
 * justification, the date added and an `expires` date at most 60 days after it.
 * An expired or malformed entry, or one that npm audit no longer reports, fails the
 * gate. A finding is only covered when every advisory behind it (including through its
 * transitive parents) is allowlisted, and critical findings can never be allowlisted.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_ALLOWLIST_DAYS = 60;
const DAY_MS = 86400000;
const ADVISORY_ID = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const defaultAllowlistPath = fileURLToPath(new URL("./audit-allowlist.json", import.meta.url));

const advisoryId = (via) => {
  const m = /GHSA-([0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i.exec(via?.url ?? "");
  return m ? `GHSA-${m[1].toLowerCase()}` : null;
};
const parseDay = (s) => (typeof s === "string" && ISO_DATE.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN);

/** Returns { entries, problems } for an allowlist document; `now` is a Date. */
export function checkAllowlist(doc, now = new Date()) {
  const problems = [];
  const entries = new Map();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!doc || !Array.isArray(doc.entries)) return { entries, problems: ["allowlist must be an object with an `entries` array"] };
  for (const [i, e] of doc.entries.entries()) {
    const label = e?.id ?? `entries[${i}]`;
    if (typeof e?.id !== "string" || !ADVISORY_ID.test(e.id)) { problems.push(`${label}: id must be a GHSA advisory id`); continue; }
    if (entries.has(e.id)) { problems.push(`${label}: duplicate entry`); continue; }
    if (typeof e.justification !== "string" || e.justification.trim().length < 20 || e.justification.includes("\n")) {
      problems.push(`${label}: justification must be a single descriptive line`);
    }
    const added = parseDay(e.added), expires = parseDay(e.expires);
    if (Number.isNaN(added) || Number.isNaN(expires)) { problems.push(`${label}: added/expires must be YYYY-MM-DD dates`); continue; }
    if (expires - added > MAX_ALLOWLIST_DAYS * DAY_MS) problems.push(`${label}: expires must be at most ${MAX_ALLOWLIST_DAYS} days after added`);
    if (expires < today) problems.push(`${label}: allowlist entry EXPIRED on ${e.expires}; re-review the advisory (take the fix, replace the dependency, or renew with a fresh justification)`);
    entries.set(e.id, e);
  }
  return { entries, problems };
}

/** Pure evaluation of an `npm audit --json` report against an allowlist document. */
export function evaluateAudit(report, allowlistDoc, now = new Date()) {
  const { entries, problems } = checkAllowlist(allowlistDoc, now);
  const vulns = report.vulnerabilities;
  const memo = new Map();
  const seenAdvisories = new Set();
  // A finding is accepted only if each of its advisories is allowlisted and each parent finding is accepted.
  const accepted = (name, stack = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return true; // cycle: decided by the other members
    stack.add(name);
    const finding = vulns[name];
    let ok = !!finding && finding.severity !== "critical" && finding.via.length > 0;
    for (const via of finding?.via ?? []) {
      if (typeof via === "string") { if (!accepted(via, stack)) ok = false; continue; }
      const id = advisoryId(via);
      if (id) seenAdvisories.add(id);
      if (!id || !entries.has(id) || via.severity === "critical") ok = false;
    }
    stack.delete(name);
    memo.set(name, ok);
    return ok;
  };
  const names = Object.keys(vulns);
  const unaccepted = names.filter((n) => !accepted(n));
  const allowed = names.filter((n) => memo.get(n));
  for (const id of entries.keys()) {
    if (!seenAdvisories.has(id)) problems.push(`${id}: allowlisted but no longer reported by npm audit; remove the stale entry`);
  }
  return { unaccepted, allowed, problems, ok: unaccepted.length === 0 && problems.length === 0 };
}

function main() {
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

  let allowlistDoc = { entries: [] };
  const allowlistPath = process.env.BOCAL_AUDIT_ALLOWLIST || defaultAllowlistPath;
  if (existsSync(allowlistPath)) {
    try { allowlistDoc = JSON.parse(readFileSync(allowlistPath, "utf8")); }
    catch (err) { console.error(`Audit allowlist ${allowlistPath} is not valid JSON: ${err.message}`); process.exit(2); }
  }
  const { unaccepted, allowed, problems, ok } = evaluateAudit(report, allowlistDoc);
  if (allowed.length) console.log(`Allowlisted via scripts/audit-allowlist.json: ${allowed.join(", ")}`);
  for (const p of problems) console.error(`AUDIT ALLOWLIST PROBLEM: ${p}`);
  const { low = 0, moderate = 0, high = 0, critical = 0 } = report.metadata.vulnerabilities;
  const total = low + moderate + high + critical;
  if (unaccepted.length) {
    console.log(`SECURITY REVIEW REQUIRED: ${unaccepted.length} un-allowlisted finding(s) (${unaccepted.join(", ")}); report totals ${low} low, ${moderate} moderate, ${high} high, ${critical} critical. No release approval implied.`);
  } else if (total > 0 && ok) {
    console.log(`All ${total} finding(s) are covered by unexpired allowlist entries. This is a time-boxed exception, not a security acceptance decision.`);
  }
  if (enforce && !ok) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
