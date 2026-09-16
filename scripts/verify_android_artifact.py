#!/usr/bin/env python3
"""Fail when an APK/AAB has lost the canonical standalone web payload.

This is a packaging check, not an Android installation/audio certification.
"""
import argparse
import hashlib
import re
import sys
import zipfile
from pathlib import Path


def verify_html(html: bytes) -> None:
    text = html.decode("utf-8")
    if len(html) < 10_000 or "<html" not in text.lower():
        raise ValueError("Missing or implausibly small standalone application")
    if "bocal" not in text.lower():
        raise ValueError("Not a Bocal application")
    if text.count("data:model/gltf-binary;base64,") < 2:
        raise ValueError("Both licensed instrument models must be embedded")
    if re.search(r'''[("'`]\/(?:images|models)\/[^"'`)\s]+''', text):
        raise ValueError("Unresolved offline model/image reference")
    if re.search(r'''<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](?:https?:)?//''', text, re.I):
        raise ValueError("Standalone application loads a remote script or stylesheet")


def verify_artifact(artifact: Path, expected_html: Path | None = None) -> dict:
    with zipfile.ZipFile(artifact) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"Corrupt ZIP member: {bad}")
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise ValueError("Duplicate ZIP entries")
        member = "base/assets/www/app.html" if artifact.suffix == ".aab" else "assets/www/app.html"
        html = archive.read(member)
    verify_html(html)
    if expected_html is not None and html != expected_html.read_bytes():
        raise ValueError("Packaged web app differs from the tested standalone build")
    return {"artifact": artifact.name, "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "web_sha256": hashlib.sha256(html).hexdigest(), "web_bytes": len(html)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--expected-html", type=Path)
    parser.add_argument("--html-only", action="store_true")
    args = parser.parse_args()
    try:
        if args.html_only:
            verify_html(args.artifact.read_bytes())
            print("Standalone payload verified")
        else:
            import json
            print(json.dumps(verify_artifact(args.artifact, args.expected_html), indent=2))
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"Artifact verification failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
