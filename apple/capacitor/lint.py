#!/usr/bin/env python3
"""Stdlib lint for the Bocal Capacitor scaffold. Exit 1 on any finding.

Static checks only: it parses the JSON and plists and greps the Xcode project. It cannot tell
whether Xcode accepts the project; that is the owner's first Mac build.
"""
import json
import plistlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLACEHOLDER = re.compile(r"INVALID[-_.]?PLACEHOLDER|invalid\.placeholder|@[A-Z_]+_NAME@", re.I)
APP_ID = re.compile(r"^com\.asoc\.[a-z][a-z0-9]*$")
IOS_APP = Path("ios/App/App")
ALLOWED_CAPACITOR = {"@capacitor/core", "@capacitor/ios", "@capacitor/cli"}


def _load_plist(path: Path, problems: list):
    try:
        return plistlib.loads(path.read_bytes())
    except Exception as error:  # plistlib raises several types
        problems.append(f"{path.name}: cannot parse ({error})")
        return None


def lint(root: Path, bundle: Path | None = None) -> list:
    problems: list = []
    config_path = root / "capacitor.config.json"
    try:
        config = json.loads(config_path.read_text())
    except Exception as error:
        return [f"capacitor.config.json: cannot parse ({error})"]

    app_id = config.get("appId", "")
    if PLACEHOLDER.search(app_id):
        problems.append(f"appId is a placeholder: {app_id!r}")
    elif not APP_ID.match(app_id):
        problems.append(f"appId {app_id!r} is not of the form com.asoc.<appname>")
    if config.get("webDir") != "www":
        problems.append("webDir must be the staged 'www' directory")
    if "server" in config:
        problems.append("config has a 'server' block (live-reload or remote URL); the bundle must load from the app")
    for key in ("allowNavigation", "cleartext"):
        if key in json.dumps(config):
            problems.append(f"config mentions {key}: no network exception is allowed")

    package = json.loads((root / "package.json").read_text())
    deps = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    for name, version in deps.items():
        if not name.startswith("@capacitor/") or name not in ALLOWED_CAPACITOR:
            problems.append(f"unexpected dependency {name}: add plugins only with a reviewed reason")
        if not re.fullmatch(r"8\.\d+\.\d+", version):
            problems.append(f"{name} must be pinned to an exact 8.x.y version, got {version!r}")

    info_path = root / IOS_APP / "Info.plist"
    info = _load_plist(info_path, problems) if info_path.exists() else None
    if info_path.exists() is False:
        problems.append("ios/App/App/Info.plist is missing (run `cap add ios`)")
    if info is not None:
        if "UIBackgroundModes" in info:
            problems.append("Info.plist declares UIBackgroundModes; Bocal stops on background like Android")
        if "NSAppTransportSecurity" in info:
            problems.append("Info.plist declares an App Transport Security exception")
        if not str(info.get("NSMicrophoneUsageDescription", "")).strip():
            problems.append("Info.plist lacks a non-empty NSMicrophoneUsageDescription")
        if PLACEHOLDER.search(json.dumps(info, default=str)):
            problems.append("Info.plist contains a placeholder identifier")

    privacy_path = root / IOS_APP / "PrivacyInfo.xcprivacy"
    if not privacy_path.exists():
        problems.append("PrivacyInfo.xcprivacy is missing")
    else:
        privacy = _load_plist(privacy_path, problems)
        if privacy is not None:
            if privacy.get("NSPrivacyTracking") is not False:
                problems.append("PrivacyInfo: NSPrivacyTracking must be false")
            if privacy.get("NSPrivacyTrackingDomains"):
                problems.append("PrivacyInfo: NSPrivacyTrackingDomains must be empty")
            if privacy.get("NSPrivacyCollectedDataTypes"):
                problems.append("PrivacyInfo: NSPrivacyCollectedDataTypes must be empty (no data is collected)")

    pbx_path = root / "ios/App/App.xcodeproj/project.pbxproj"
    if not pbx_path.exists():
        problems.append("project.pbxproj is missing")
    else:
        pbx = pbx_path.read_text()
        ids = set(re.findall(r"PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);", pbx))
        if ids != {app_id}:
            problems.append(f"PRODUCT_BUNDLE_IDENTIFIER values {sorted(ids)} do not equal appId {app_id!r}")
        if PLACEHOLDER.search(pbx):
            problems.append("project.pbxproj contains a placeholder identifier")
        if re.search(r"DEVELOPMENT_TEAM\s*=\s*[^;\s\"]", pbx):
            problems.append("project.pbxproj embeds a DEVELOPMENT_TEAM; signing identity is the owner's, never committed")
        if "PrivacyInfo.xcprivacy in Resources" not in pbx:
            problems.append("PrivacyInfo.xcprivacy is not in the app target's Resources phase")

    staged = root / "www" / "index.html"
    if staged.exists() and bundle is not None and bundle.exists():
        if staged.read_bytes() != bundle.read_bytes():
            problems.append("www/index.html differs from the bundle; rerun scripts/stage_bundle.sh")
    return problems


def main() -> int:
    bundle = HERE / "../../web-source/preview-dist/index.html"
    problems = lint(HERE, bundle.resolve())
    for problem in problems:
        print(f"LINT {problem}")
    staged = (HERE / "www/index.html").exists()
    print(f"apple/capacitor lint: {len(problems)} problem(s); bundle byte check {'ran' if staged and bundle.exists() else 'skipped (not staged or not built)'}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
