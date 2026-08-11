#!/usr/bin/env bash
set -euo pipefail

apk="${1:-}"
if [[ -z "$apk" || ! -f "$apk" ]]; then
  echo "Usage: $0 path/to/app.apk"
  exit 2
fi

python3 - "$apk" <<'PY'
import sys, zipfile
path = sys.argv[1]
if not zipfile.is_zipfile(path):
    raise SystemExit("Not a valid ZIP/APK container")
with zipfile.ZipFile(path) as archive:
    names = set(archive.namelist())
required = {"AndroidManifest.xml", "classes.dex", "resources.arsc"}
missing = sorted(required - names)
if missing:
    raise SystemExit("Invalid APK; missing: " + ", ".join(missing))
print(f"APK container valid: {path}")
PY

if command -v apkanalyzer >/dev/null 2>&1; then
  apkanalyzer manifest application-id "$apk"
  apkanalyzer manifest permissions "$apk"
fi
