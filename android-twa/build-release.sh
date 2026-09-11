#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# The SDK must be provisioned under this project before running this script.
# This intentionally refuses /tmp, /nix/store, or a machine-global SDK.
SDK_DIR="$ROOT/build/android-sdk"
if [[ ! -x "$SDK_DIR/platform-tools/adb" && ! -d "$SDK_DIR/platforms/android-36" ]]; then
  echo "Missing project-local Android SDK: $SDK_DIR" >&2
  echo "Provision the SDK under android-twa/build/android-sdk, then retry." >&2
  exit 1
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export GRADLE_USER_HOME="$ROOT/build/gradle-home"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.io.tmpdir=$ROOT/build/tmp"

mkdir -p "$ROOT/dist" "$ROOT/build/tmp"
./gradlew bundleRelease --no-daemon

UNSIGNED="$ROOT/app/build/outputs/bundle/release/app-release.aab"
SIGNED="$ROOT/dist/gravelkingpro-release.aab"
PASS="$(cat "$ROOT/.keystore-pass")"
jarsigner \
  -keystore "$ROOT/android.keystore" \
  -storepass "$PASS" \
  -keypass "$PASS" \
  -signedjar "$SIGNED" \
  "$UNSIGNED" \
  android >/dev/null

jarsigner -verify "$SIGNED" >/dev/null

# Keep only the distributable bundle. Gradle intermediates and generated
# reports are disposable and are removed immediately after compilation.
rm -rf "$ROOT/app/build"
rm -rf "$ROOT/build/reports" "$ROOT/build/kotlin" "$ROOT/build/intermediates"
echo "Release bundle: $SIGNED"