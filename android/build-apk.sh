#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if [[ -x ./gradlew && -f ./gradle/wrapper/gradle-wrapper.jar ]]; then
  ./gradlew --no-daemon :app:testDebugUnitTest :app:assembleDebug
elif command -v gradle >/dev/null 2>&1; then
  gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug
else
  echo "Gradle is unavailable. Open this folder in Android Studio, allow it to install Gradle 9.5.0 and Android SDK Platform 36, then run this script again."
  exit 2
fi

apk="$project_dir/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$apk" ]]; then
  echo "Build completed without the expected APK: $apk"
  exit 3
fi

"$project_dir/verify-apk.sh" "$apk"
echo "Verified APK: $apk"
