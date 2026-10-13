import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateAudit, checkAllowlist } from "../../scripts/audit-dependencies.mjs";

const ID = "GHSA-vfj7-8cjw-p6xm";
const advisory = { source: 1, name: "braces", severity: "high", url: `https://github.com/advisories/${ID}`, range: "<=3.0.3" };
const report = () => ({
  vulnerabilities: {
    braces: { name: "braces", severity: "high", via: [advisory] },
    micromatch: { name: "micromatch", severity: "high", via: ["braces"] },
    vinext: { name: "vinext", severity: "high", via: ["micromatch"] },
  },
});
const entry = (over = {}) => ({
  id: ID, justification: "dev-time only transitive with no upstream fix", added: "2026-10-12", expires: "2026-12-11", ...over,
});
const now = new Date("2026-10-20T12:00:00Z");

test("allowlisted advisory covers the finding and its transitive parents", () => {
  const r = evaluateAudit(report(), { entries: [entry()] }, now);
  assert.deepEqual(r.unaccepted, []);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test("a finding with no allowlist entry is not accepted", () => {
  const r = evaluateAudit(report(), { entries: [] }, now);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unaccepted.sort(), ["braces", "micromatch", "vinext"]);
});

test("an expired entry fails the gate", () => {
  const r = evaluateAudit(report(), { entries: [entry()] }, new Date("2026-12-12T00:00:00Z"));
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /EXPIRED on 2026-12-11/);
});

test("the expiry day itself is still valid", () => {
  assert.equal(evaluateAudit(report(), { entries: [entry()] }, new Date("2026-12-11T23:59:00Z")).ok, true);
});

test("an unrelated new advisory under an allowlisted parent still fails", () => {
  const rep = report();
  rep.vulnerabilities.vinext.via.push({ ...advisory, url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" });
  const r = evaluateAudit(rep, { entries: [entry()] }, now);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unaccepted, ["vinext"]);
});

test("critical findings can never be allowlisted", () => {
  const rep = report();
  rep.vulnerabilities.braces.severity = "critical";
  rep.vulnerabilities.braces.via = [{ ...advisory, severity: "critical" }];
  assert.equal(evaluateAudit(rep, { entries: [entry()] }, now).ok, false);
});

test("stale entries (no longer reported) must be removed", () => {
  const r = evaluateAudit({ vulnerabilities: {} }, { entries: [entry()] }, now);
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /no longer reported/);
});

test("entries are validated: id, one-line justification, dates, 60-day window", () => {
  const bad = [
    entry({ id: "CVE-2024-1" }), entry({ justification: "" }), entry({ expires: "soon" }),
    entry({ expires: "2027-03-01" }),
  ];
  for (const e of bad) assert.notEqual(checkAllowlist({ entries: [e] }, now).problems.length, 0, JSON.stringify(e));
  assert.notEqual(checkAllowlist({ entries: [entry(), entry()] }, now).problems.length, 0);
  assert.notEqual(checkAllowlist({}, now).problems.length, 0);
});

test("the committed allowlist is well-formed", () => {
  const doc = JSON.parse(readFileSync(new URL("../../scripts/audit-allowlist.json", import.meta.url), "utf8"));
  const { problems } = checkAllowlist(doc, new Date("2026-10-12T00:00:00Z"));
  assert.deepEqual(problems, []);
});
