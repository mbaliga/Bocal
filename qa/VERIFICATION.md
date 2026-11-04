# Verification record

Updated 17 September 2026. The former 10 August prototype snapshot is not current release evidence.

## How to read the evidence

PR #9 contains the production hardening pass. Always pair results with the exact source SHA and run ID. CI logs and the retained `bocal-verification-evidence` / `bocal-android-runtime-evidence` artifacts are the authoritative execution results; the presence of a test file is not a pass.

The first hardening checkpoint at ba04fafdab73f3bafaac13b514422015f85248ec passed Actions run 35151199901: shared web checks, explicit browser/contrast checks, Android debug and minified release builds, instrumentation compilation, and packaged-payload verification. This was before the later recording-lifecycle changes, dependency refresh and expanded runtime tests; it does not certify those later commits.

Focused isolated tests during the initial implementation passed: 23 recording-storage cases, 11 packaging-verifier cases, and strict typecheck of the new storage modules. Full repository and integration validation is performed by Actions, not claimed from the isolated test run.

## Repeatable checks

From `web-source/`: `npm ci`, `npm test`, `npm run lint`, `npm run build`, `node --test tests/*.dist-test.mjs`, `npm run preview:standalone`, `node tests/theme.test.mjs`, `npm run test:e2e`, `node tests/production-smoke.mjs`, `node ../scripts/audit-dependencies.mjs --enforce`.

From the root: `python3 -m unittest discover -s scripts -p 'test_*.py'`.

## Dependency audit allowlist

`node ../scripts/audit-dependencies.mjs --enforce` fails on any `npm audit` finding unless every advisory behind it is listed in `scripts/audit-allowlist.json`. The allowlist is not a suppression: it is a time-boxed, reviewed exception list.

- Each entry has the advisory `id` (GHSA), a one-line `justification`, `added`, and an `expires` date at most 60 days after `added`.
- The gate fails when an entry has expired, is malformed, or is no longer reported by `npm audit` (remove stale entries). Critical findings can never be allowlisted, and a new advisory on an already-allowlisted package still fails because only listed advisory IDs are accepted.
- Renewing an entry means re-checking whether a fixed version now exists (`npm view <pkg> versions`, `npm audit --json` `via[].url`), taking it if so, and otherwise rewriting the justification and dates.
- `web-source/tests/audit-allowlist.test.mjs` covers the matching, expiry and validation logic.

Current entry (added 2026-10-28, expires 2026-12-27): GHSA-wx4j-mvgx-mqwp, improper SVG escaping in satori (satori > @vercel/og > vinext, moderate). Bocal never calls vinext's OG image route or satori, the chain is build-time only, and the patched vinext 1.3.1 needs React 19.3, a framework upgrade kept out of a dependency-patch change. Everything else reported on 2026-10-28 (Next 16.4.3, Vite 8.3.5, wrangler 4.154.0, @cloudflare/vite-plugin 1.65.0, undici 7.30.1 by override, zod, fast-uri) was patched rather than allowlisted.

Android's workflow stages that exact web bundle, compiles debug/instrumentation/minified release variants, verifies payload identity, and runs the debug instrumentation suite in an API 35 emulator. Browser fake capture and emulator installation are not measurements of physical mic accuracy or musical performance.

## Explicit exclusions

No physical-device acceptance, professional musical review, genuine production-signing identity, published store release, or TonalEnergy comparative study is asserted by this work. Follow `docs/PRODUCTION_V1_ACCEPTANCE.md` before production promotion.
