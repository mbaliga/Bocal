#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
apk_path="${1:-$repo_dir/debug-apks/Bocal-native-debug-0.2.0.apk}"
adb_bin="${ADB:-}"

if [[ -z "$adb_bin" ]]; then
  if command -v adb >/dev/null 2>&1; then
    adb_bin="$(command -v adb)"
  elif [[ -n "${ANDROID_SDK_ROOT:-}" && -x "${ANDROID_SDK_ROOT}/platform-tools/adb" ]]; then
    adb_bin="${ANDROID_SDK_ROOT}/platform-tools/adb"
  else
    echo "adb was not found. Install Android platform-tools or set ADB." >&2
    exit 2
  fi
fi

if [[ ! -f "$apk_path" ]]; then
  echo "APK not found: $apk_path" >&2
  exit 2
fi

mapfile -t devices < <("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if [[ "${#devices[@]}" -ne 1 ]]; then
  echo "Connect exactly one authorized physical Android device; found ${#devices[@]}." >&2
  "$adb_bin" devices -l
  exit 3
fi

serial="${devices[0]}"
case "$serial" in
  emulator-*)
    echo "This protocol requires physical hardware; $serial is an emulator." >&2
    exit 3
    ;;
esac

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
result_dir="$repo_dir/android/device-results/$run_id"
mkdir -p "$result_dir"

"$adb_bin" -s "$serial" install -r -t "$apk_path" | tee "$result_dir/install.txt"
"$adb_bin" -s "$serial" shell pm grant com.bocal.music android.permission.RECORD_AUDIO || true
"$adb_bin" -s "$serial" shell getprop > "$result_dir/getprop.txt"
"$adb_bin" -s "$serial" shell dumpsys audio > "$result_dir/audio.txt"
"$adb_bin" -s "$serial" shell dumpsys media.audio_flinger > "$result_dir/audio-flinger.txt"

(
  cd "$repo_dir/android"
  ./gradlew :app:connectedDebugAndroidTest
) | tee "$result_dir/instrumentation.txt"

"$adb_bin" -s "$serial" shell am force-stop com.bocal.music
"$adb_bin" -s "$serial" shell monkey -p com.bocal.music -c android.intent.category.LAUNCHER 1 > "$result_dir/launch.txt"
"$adb_bin" -s "$serial" logcat -d -t 800 > "$result_dir/logcat.txt"

echo "Automated physical checks completed on $serial."
echo "Evidence: $result_dir"
echo "Now complete the acoustic accuracy and loopback-latency rows in android/PHYSICAL_DEVICE_TEST_PLAN.md."
