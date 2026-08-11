#!/usr/bin/env python3
"""Structural validator for Bocal's generated binary glTF pack."""

from __future__ import annotations

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def read_glb(path: Path) -> dict:
    blob = path.read_bytes()
    if len(blob) < 20:
        raise AssertionError(f"{path.name}: too small")
    magic, version, total = struct.unpack_from("<4sII", blob, 0)
    assert magic == b"glTF", f"{path.name}: bad magic"
    assert version == 2, f"{path.name}: expected glTF 2"
    assert total == len(blob), f"{path.name}: declared length mismatch"
    json_length, json_type = struct.unpack_from("<I4s", blob, 12)
    assert json_type == b"JSON", f"{path.name}: first chunk is not JSON"
    return json.loads(blob[20 : 20 + json_length])


def main() -> None:
    catalog = json.loads((ROOT / "catalog.json").read_text())
    instruments = catalog["instruments"]
    assert catalog["instrumentCount"] == 35 == len(instruments)
    assert len({item["id"] for item in instruments}) == len(instruments)

    expected_files = set()
    for item in instruments:
        path = ROOT / item["file"]
        expected_files.add(path.resolve())
        assert path.exists(), f"missing {path}"
        doc = read_glb(path)
        assert doc["asset"]["version"] == "2.0"
        assert doc["extras"]["scope"] == "educational, non-CAD"
        assert doc["extras"]["instrument"]["id"] == item["id"]
        nodes = doc.get("nodes", [])
        controls = [node for node in nodes if node.get("extras", {}).get("interactive")]
        assert len(controls) == item["interactiveControls"], (
            f"{item['id']}: catalog says {item['interactiveControls']} controls, got {len(controls)}"
        )
        ids = [node["extras"].get("keyId") for node in controls]
        assert all(ids), f"{item['id']}: interactive node without keyId"
        assert len(ids) == len(set(ids)), f"{item['id']}: duplicate keyId"
        assert all(node.get("name", "").startswith("key__") for node in controls)

    actual_files = {path.resolve() for path in (ROOT / "glb").glob("*.glb")}
    assert actual_files == expected_files, "GLB directory and catalog differ"
    print(f"Validated {len(instruments)} GLB files and {sum(item['interactiveControls'] for item in instruments)} interactive controls.")


if __name__ == "__main__":
    main()
