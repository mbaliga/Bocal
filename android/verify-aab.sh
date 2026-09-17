#!/usr/bin/env bash
set -euo pipefail

aab="${1:-}"
if [[ -z "$aab" || ! -f "$aab" ]]; then
  echo "Usage: $0 path/to/app.aab" >&2
  exit 2
fi

python3 - "$aab" <<'PY'
import sys
import zipfile

path = sys.argv[1]
if not zipfile.is_zipfile(path):
    raise SystemExit("Not a valid ZIP/AAB container")

with zipfile.ZipFile(path) as archive:
    names = set(archive.namelist())

required = {"BundleConfig.pb", "base/manifest/AndroidManifest.xml", "base/resources.pb"}
missing = sorted(required - names)
if missing:
    raise SystemExit("Invalid AAB; missing: " + ", ".join(missing))
if not any(name.startswith("base/dex/") and name.endswith(".dex") for name in names):
    raise SystemExit("Invalid AAB; no base dex files found")
PY

if ! command -v jarsigner >/dev/null 2>&1; then
  echo "jarsigner is required to verify a release AAB" >&2
  exit 1
fi

verification="$(mktemp)"
trap 'rm -f "$verification"' EXIT
if ! jarsigner -verify -strict -verbose -certs "$aab" >"$verification" 2>&1; then
  cat "$verification" >&2
  exit 1
fi

if grep -Eiq "Android Debug|CN=Android Debug" "$verification"; then
  echo "Refusing a debug-signed AAB" >&2
  exit 1
fi

echo "Signed release AAB valid: $aab"
grep -Ei "X\.509|CN=|jar verified" "$verification" || true
