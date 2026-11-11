#!/usr/bin/env python3
"""Fail when a packaged host artefact does not carry the tested standalone bundle.

Generalises scripts/verify_android_artifact.py to ZIP-based host artefacts (.ipa, .msix,
.apk, .aab, a zipped .app). It checks that the payload is byte-identical to the bundle built in
the same job, that no conformance page was packaged, and that no placeholder identifier survives.
It is a packaging check only: it says nothing about how any host behaves.

Formats that are not ZIP (.click, .deb, .dmg, .AppImage, Flatpak bundles) are refused rather than
guessed at; extract the payload first and check it with scripts/verify_android_artifact.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from verify_android_artifact import verify_html  # noqa: E402  (imported, not copied)

PAYLOAD_SUFFIXES = ("assets/www/app.html", "app.html", "www/index.html", "index.html")
CONFORMANCE_MARKER = b"bocal-host-conformance"
# The invalid identifiers scaffolds carry until a NAMES.md row exists.
PLACEHOLDER = re.compile(rb"INVALID[-_.]?PLACEHOLDER|invalid\.placeholder|@[A-Z_]+_NAME@", re.I)
MAX_SCAN_BYTES = 4 * 1024 * 1024


def find_payload_member(names: list[str], member: str | None) -> str:
    if member is not None:
        if member not in names:
            raise KeyError(member)
        return member
    for suffix in PAYLOAD_SUFFIXES:
        hits = sorted(n for n in names if n == suffix or n.endswith("/" + suffix))
        if len(hits) > 1:
            raise ValueError(f"Ambiguous payload, several members end in {suffix}: {hits}")
        if hits:
            return hits[0]
    raise KeyError("no standalone app.html member found")


def verify_payload(artifact: Path, expected_html: Path, member: str | None = None,
                   allow_placeholder: bool = False) -> dict:
    expected = expected_html.read_bytes()
    with zipfile.ZipFile(artifact) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"Corrupt ZIP member: {bad}")
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entries")
        payload_name = find_payload_member(names, member)
        html = archive.read(payload_name)
        verify_html(html)
        if html != expected:
            raise ValueError("Packaged web app differs from the bundle built in this job")
        for name in names:
            if "conformance" in Path(name).name.lower():
                raise ValueError(f"Conformance page packaged: {name}")
        for name in names:
            info = archive.getinfo(name)
            if info.is_dir() or info.file_size > MAX_SCAN_BYTES:
                continue
            data = b"" if name == payload_name else archive.read(name)
            if CONFORMANCE_MARKER in data or (name == payload_name and CONFORMANCE_MARKER in html):
                raise ValueError(f"Conformance marker found in {name}")
            if not allow_placeholder and (PLACEHOLDER.search(name.encode()) or PLACEHOLDER.search(data)):
                raise ValueError(f"Placeholder identifier present in {name}")
    return {"artifact": artifact.name, "payload_member": payload_name,
            "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "web_sha256": hashlib.sha256(html).hexdigest(), "web_bytes": len(html)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--expected-html", type=Path, required=True)
    parser.add_argument("--member", help="path of the payload inside the ZIP (default: search)")
    parser.add_argument("--allow-placeholder", action="store_true",
                        help="compile-only lanes; package and sign lanes must not pass this")
    args = parser.parse_args()
    try:
        print(json.dumps(verify_payload(args.artifact, args.expected_html, args.member,
                                        args.allow_placeholder), indent=2))
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"Payload verification failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
