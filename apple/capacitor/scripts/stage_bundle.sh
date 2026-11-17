#!/usr/bin/env bash
# Copies the standalone bundle, byte for byte, to www/index.html (Capacitor's webDir).
# Never edits it: the same bytes ship on every host (host-bridge contract).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${BOCAL_BUNDLE:-$here/../../web-source/preview-dist/index.html}"
if [ ! -s "$src" ]; then
  echo "Missing bundle: $src. Run: (cd web-source && npm ci && npm run preview:standalone)" >&2
  exit 1
fi
rm -rf "$here/www"
mkdir -p "$here/www"
cp "$src" "$here/www/index.html"
cmp "$src" "$here/www/index.html"
echo "staged $(wc -c < "$here/www/index.html") bytes to apple/capacitor/www/index.html"
