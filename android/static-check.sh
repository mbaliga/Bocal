#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path('.')
manifest = root / 'app/src/main/AndroidManifest.xml'
text = manifest.read_text()
if 'android.permission.INTERNET' in text:
    raise SystemExit('FAIL: INTERNET permission is present')
if 'android:allowBackup="true"' in text:
    raise SystemExit('FAIL: allowBackup is true (practice data must not be cloud-backed-up)')

for path in [manifest, *sorted((root / 'app/src/main/res').rglob('*.xml'))]:
    ET.parse(path)

required = [
    root / 'app/src/main/java/com/bocal/music/MainActivity.kt',
    root / 'app/src/main/java/com/bocal/music/ui/WebAppScreen.kt',
    root / 'app/src/main/java/com/bocal/music/ui/LocalAssetWebViewClient.java',
    root / 'app/src/main/java/com/bocal/music/ui/BocalHost.kt',
]
missing = [str(x) for x in required if not x.exists()]
if missing:
    raise SystemExit('FAIL: missing required files: ' + ', '.join(missing))

dead_files = [
    root / 'app/src/main/java/com/bocal/music/ui/BocalApp.kt',
    root / 'app/src/main/java/com/bocal/music/ui/BocalTheme.kt',
    root / 'app/src/main/assets/www/lab.html',
    root / 'app/src/main/assets/www/lab.js',
    root / 'app/src/main/assets/www/lab.css',
    root / 'app/src/main/assets/www/catalog-v04.json',
]
present = [str(x) for x in dead_files if x.exists()]
if present:
    raise SystemExit('FAIL: dead Lab/Compose files have reappeared: ' + ', '.join(present))
if (root / 'app/src/main/java/com/bocal/music/audio').exists():
    raise SystemExit('FAIL: the dead audio/ engine tree has reappeared')
if (root / 'app/src/main/assets/www/models').exists() or (root / 'app/src/main/assets/www/vendor').exists():
    raise SystemExit('FAIL: the dead Lab models/vendor tree has reappeared')

host = (root / 'app/src/main/java/com/bocal/music/ui/BocalHost.kt').read_text()
for method in ['setTheme', 'setKeepAwake', 'saveFile', 'openExternal']:
    if f'fun {method}' not in host:
        raise SystemExit(f'FAIL: BocalHost is missing the native bridge method {method}')

print('PASS: XML parses; zero INTERNET permission; allowBackup=false; no dead Lab/Compose files; native bridge complete')
PY

if [ -f app/src/main/assets/www/app.html ]; then
  printf '%s\n' 'PASS: staged app.html present'
else
  printf '%s\n' 'NOTE: app.html not staged yet -- run `./gradlew stageWebApp` or `npm run preview:standalone` in web-source/ first'
fi
