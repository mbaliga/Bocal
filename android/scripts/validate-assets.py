#!/usr/bin/env python3
from pathlib import Path
import json, struct, sys

root = Path(__file__).resolve().parents[1]
www = root / 'app/src/main/assets/www'
catalog = json.loads((www/'catalog-v04.json').read_text())

def png_size(path: Path):
    data = path.read_bytes()[:24]
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', data[16:24])

def gltf_stats(path: Path):
    doc = json.loads(path.read_text())
    accessors = doc.get('accessors', [])
    triangles = 0
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                continue
            if 'indices' in primitive:
                triangles += accessors[primitive['indices']]['count'] // 3
            else:
                pos = primitive.get('attributes', {}).get('POSITION')
                if pos is not None:
                    triangles += accessors[pos]['count'] // 3
    for buffer in doc.get('buffers', []):
        uri = buffer.get('uri')
        if uri and not uri.startswith('data:') and not (path.parent/uri).exists():
            raise SystemExit(f'FAIL: missing glTF buffer {path.parent/uri}')
    for image in doc.get('images', []):
        uri = image.get('uri')
        if uri and not uri.startswith('data:') and not (path.parent/uri).exists():
            raise SystemExit(f'FAIL: missing glTF image {path.parent/uri}')
    return len(doc.get('meshes', [])), len(doc.get('nodes', [])), triangles

runtime_models = sorted(p for p in (www/'models').rglob('*') if p.is_file())
legacy = [p for p in runtime_models if p.suffix.lower()=='.glb']
if legacy:
    raise SystemExit('FAIL: placeholder/legacy GLB assets remain: ' + ', '.join(str(p.relative_to(www)) for p in legacy))

expected = {'alto-sax','oboe'}
actual = {i['id'] for i in catalog['instruments']}
if actual != expected:
    raise SystemExit(f'FAIL: runtime detailed instrument set mismatch: {actual}')

for item in catalog['instruments']:
    path = www/item['modelPath']
    if not path.exists():
        raise SystemExit(f'FAIL: missing model {path}')
    meshes, nodes, tris = gltf_stats(path)
    if meshes != item['meshCount'] or nodes != item['nodeCount'] or tris != item['triangleCount']:
        raise SystemExit(f"FAIL: catalog stats mismatch for {item['id']}: got meshes={meshes}, nodes={nodes}, triangles={tris}")
    if not (www/item['licenseFile']).exists():
        raise SystemExit(f"FAIL: missing license for {item['id']}")

for png in (www/'models').rglob('*.png'):
    size = png_size(png)
    if size and (size[0] > 2048 or size[1] > 2048):
        raise SystemExit(f'FAIL: mobile texture exceeds 2K: {png} {size}')

sax = json.loads((www/'data/sax-metadata.json').read_text())
keys = {k['id'] for k in sax['keys']}
if len(keys) != 23 or len(sax['mechanics']) != 23:
    raise SystemExit(f"FAIL: expected validated 23 sax touch-pieces, got keys={len(keys)} mechanics={len(sax['mechanics'])}")
if len(sax['fingerings']) != 33:
    raise SystemExit(f"FAIL: expected 33 chromatic sax fingerings B-flat3-F-sharp6, got {len(sax['fingerings'])}")
for f in sax['fingerings']:
    choices = [f['keys']] + [a['keys'] for a in f.get('alternates', [])]
    for choice in choices:
        unknown = set(choice) - keys
        if unknown:
            raise SystemExit(f"FAIL: {f['id']} references unknown control(s): {unknown}")
if sax['fingerings'][0]['id'] != 'bb3' or sax['fingerings'][-1]['id'] != 'fs6':
    raise SystemExit('FAIL: sax fingering range no longer matches validated B-flat3-F-sharp6 contract')

excluded = {x['name']: x['reason'] for x in catalog.get('excludedModels', [])}
if not any('Clarinet' in name and 'CC-BY-NC' in reason for name, reason in excluded.items()):
    raise SystemExit('FAIL: clarinet non-commercial license exclusion is not documented')

print('PASS: detailed sax/oboe assets, 2K textures, licenses, and validated sax interaction metadata')
print(f"  alto-sax: {catalog['instruments'][0]['triangleCount']:,} triangles; 23 touch-pieces; 33 written fingerings")
print(f"  oboe: {catalog['instruments'][1]['meshCount']} meshes; {catalog['instruments'][1]['triangleCount']:,} triangles; anatomy-preview boundary")
