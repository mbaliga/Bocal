#!/usr/bin/env bash
set -euo pipefail
mkdir -p qa/reports/android
collect() {
  adb logcat -d > qa/reports/android/logcat.txt 2>&1 || true
  adb exec-out screencap -p > qa/reports/android/emulator.png 2>/dev/null || true
}
trap collect EXIT
app=$(find emulator-apks -name app-debug.apk -print -quit)
tests=$(find emulator-apks -name app-debug-androidTest.apk -print -quit)
test -n "$app" && test -n "$tests"
adb install -r "$app"
adb install -r "$tests"
adb logcat -c
adb shell am instrument -w -r com.bocal.music.test/androidx.test.runner.AndroidJUnitRunner | tee qa/reports/android/instrumentation.txt
grep -Eq '^OK \([0-9]+ tests?\)' qa/reports/android/instrumentation.txt
if grep -Eq 'FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed' qa/reports/android/instrumentation.txt; then exit 1; fi
printf 'source_sha=%s\napi=35\nphysical_device=false\nrelease_signing=false\n' "${GITHUB_SHA:-local}" > qa/reports/android/BUILD.txt
