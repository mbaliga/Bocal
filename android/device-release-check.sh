#!/usr/bin/env bash
set -euo pipefail
APK="${1:-app/build/outputs/apk/debug/app-debug.apk}"
ADB="${ADB:-adb}"
PACKAGE="com.bocal.music"
ACTIVITY="com.bocal.music/.MainActivity"
command -v "$ADB" >/dev/null || { echo "FAIL: adb is required" >&2; exit 2; }
[[ -f "$APK" ]] || { echo "FAIL: APK not found: $APK" >&2; exit 2; }
DEVICE_COUNT="$($ADB devices | awk 'NR>1 && $2=="device" {n++} END {print n+0}')"
[[ "$DEVICE_COUNT" -eq 1 ]] || { echo "FAIL: exactly one authorized Android target is required; found $DEVICE_COUNT" >&2; exit 3; }
$ADB install -r -t "$APK"
$ADB shell am force-stop "$PACKAGE"
$ADB shell pm revoke "$PACKAGE" android.permission.RECORD_AUDIO >/dev/null 2>&1 || true
$ADB logcat -c
$ADB shell am start -W -n "$ACTIVITY"
sleep 2
CRASHES="$($ADB logcat -d -t 500 | grep -E "FATAL EXCEPTION|AndroidRuntime.*${PACKAGE}" || true)"
[[ -z "$CRASHES" ]] || { echo "$CRASHES"; echo "FAIL: crash found after cold launch" >&2; exit 4; }
DUMP="$($ADB shell uiautomator dump /sdcard/bocal-ui.xml >/dev/null && $ADB shell cat /sdcard/bocal-ui.xml)"
grep -q "Start live tuner" <<<"$DUMP" || { echo "FAIL: Tune CTA not reachable" >&2; exit 5; }
grep -q "Practice" <<<"$DUMP" || { echo "FAIL: bottom navigation not reachable" >&2; exit 5; }
$ADB shell pm grant "$PACKAGE" android.permission.RECORD_AUDIO
$ADB shell am force-stop "$PACKAGE"
$ADB shell am start -W -n "$ACTIVITY" >/dev/null
sleep 1
$ADB shell dumpsys package "$PACKAGE" | grep -A4 "android.permission.RECORD_AUDIO" || true
echo "PASS: install, cold launch, no immediate crash, primary UI reachability, microphone revoke/grant cycle"
echo "MANUAL REQUIRED: play real sax/oboe into the mic, inspect model overlay alignment, rotate the Howarth model, use TalkBack/Switch Access, and exercise audio-route changes."
