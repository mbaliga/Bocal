#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
pointer="${project_root}/debug-apks/latest-debug-apk.txt"

if [[ ! -f "${pointer}" ]]; then
  echo "Missing debug APK pointer: ${pointer}" >&2
  exit 66
fi

IFS= read -r apk_name < "${pointer}"
if [[ -z "${apk_name}" || "${apk_name}" == */* || "${apk_name}" != *.apk ]]; then
  echo "Invalid debug APK pointer: ${apk_name}" >&2
  exit 65
fi

apk_source="${project_root}/debug-apks/${apk_name}"
apk_target="${project_root}/public/downloads/Bocal-native-debug.apk"
if [[ ! -f "${apk_source}" ]]; then
  echo "Debug APK does not exist: ${apk_source}" >&2
  exit 66
fi

install -m 0644 "${apk_source}" "${apk_target}"
echo "Staged ${apk_name} for the public download."
