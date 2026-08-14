#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path('.')
manifest=root/'app/src/main/AndroidManifest.xml'
text=manifest.read_text()
if 'android.permission.INTERNET' in text:
    raise SystemExit('FAIL: INTERNET permission is present')
for path in [manifest,*sorted((root/'app/src/main/res').rglob('*.xml'))]: ET.parse(path)
required=[
 root/'app/src/main/java/com/bocal/music/ui/BocalApp.kt',
 root/'app/src/main/java/com/bocal/music/audio/TunerEngine.kt',
 root/'app/src/main/java/com/bocal/music/audio/PitchStabilizer.kt',
 root/'app/src/main/assets/www/lab.html', root/'app/src/main/assets/www/lab.js', root/'app/src/main/assets/www/lab.css',
 root/'app/src/main/assets/www/catalog-v04.json', root/'app/src/main/assets/www/data/sax-metadata.json',
 root/'app/src/main/assets/www/vendor/three.module.js', root/'app/src/main/assets/www/vendor/GLTFLoader.js', root/'app/src/main/assets/www/vendor/OrbitControls.js',
]
missing=[str(x) for x in required if not x.exists()]
if missing: raise SystemExit('FAIL: missing required files: '+', '.join(missing))
ui=(root/'app/src/main/java/com/bocal/music/ui/BocalApp.kt').read_text()
for screen in ['TUNE("Tune"','LAB("3D lab"','PULSE("Pulse"','ANALYZE("Analyze"','PRACTICE("Practice"']:
    if screen not in ui: raise SystemExit('FAIL: latest five-tab surface missing '+screen)
if 'loadUrl("https://appassets.androidplatform.net/assets/www/lab.html")' not in ui:
    raise SystemExit('FAIL: Android lab is not wired to the 0.4 detailed local viewer')
print('PASS: XML parses; zero INTERNET permission; latest five-tab Android shell and local detailed Lab are wired')
PY

python3 scripts/validate-assets.py
node --check app/src/main/assets/www/lab.js
node --check app/src/main/assets/www/vendor/OrbitControls.js
node --check app/src/main/assets/www/vendor/GLTFLoader.js
printf '%s\n' 'PASS: local Lab JavaScript syntax'
