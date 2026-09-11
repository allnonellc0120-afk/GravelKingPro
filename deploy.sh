#!/usr/bin/env bash
set -Eeuo pipefail

# GravelKing Pro one-click migration/deployment bootstrap.
# This script is intentionally fail-closed: it never invents credentials,
# skips a failed dependency install, or imports a schema without DATABASE_URL.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

NODE_VERSION="${NODE_VERSION:-24.13.0}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11.14}"
FFMPEG_VERSION="${FFMPEG_VERSION:-7.1.1}"
API_PORT="${API_PORT:-8080}"
WEB_PORT="${WEB_PORT:-5000}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Required command missing: $1"; }

install_base_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing base build tools"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl git build-essential postgresql-client xz-utils tar unzip
    rm -rf /var/lib/apt/lists/*
  else
    log "apt-get unavailable; checking for preinstalled build tools"
  fi
}

install_mise_runtimes() {
  if ! command -v mise >/dev/null 2>&1; then
    log "Installing mise for pinned Node.js and Python runtimes"
    curl --fail --silent --show-error https://mise.run | sh
  fi
  export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
  eval "$(mise activate bash)"
  mise settings set experimental true
  mise install --yes "node@$NODE_VERSION" "python@$PYTHON_VERSION"
  mise use --global "node@$NODE_VERSION" "python@$PYTHON_VERSION"
  hash -r
}

install_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && [[ "$(ffmpeg -version 2>/dev/null | sed -n '1s/.*ffmpeg version \([^ -]*\).*/\1/p')" == "$FFMPEG_VERSION" ]]; then
    return
  fi
  [[ "$(uname -m)" == "x86_64" ]] || die "The pinned FFmpeg bootstrap currently supports x86_64 only"
  local archive_url="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-${FFMPEG_VERSION}/ffmpeg-n${FFMPEG_VERSION}-linux64-gpl-${FFMPEG_VERSION}.tar.xz"
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  log "Installing pinned FFmpeg ${FFMPEG_VERSION}"
  curl --fail --location --retry 3 "$archive_url" -o "$temp_dir/ffmpeg.tar.xz" \
    || die "Could not download the pinned FFmpeg ${FFMPEG_VERSION}; install it manually and rerun"
  tar -xJf "$temp_dir/ffmpeg.tar.xz" -C "$temp_dir"
  local extracted
  extracted="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d -name 'ffmpeg-*' | head -1)"
  [[ -n "$extracted" ]] || die "Pinned FFmpeg archive had an unexpected layout"
  install -m 0755 "$extracted/bin/ffmpeg" /usr/local/bin/ffmpeg
  install -m 0755 "$extracted/bin/ffprobe" /usr/local/bin/ffprobe
  rm -rf "$temp_dir"
  trap - EXIT
}

import_schema() {
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL must be set before schema import"
  [[ -f schema_export.sql ]] || die "schema_export.sql is missing"
  require_command psql
  log "Importing schema_export.sql"
  psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file=schema_export.sql
}

build_application() {
  require_command pnpm
  log "Installing workspace dependencies"
  pnpm install --frozen-lockfile
  log "Building the complete workspace"
  pnpm run build
}

wait_for_http() {
  local url="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  until curl --fail --silent --show-error "$url" >/dev/null; do
    (( SECONDS >= deadline )) && die "Health check timed out: $url"
    sleep 2
  done
  log "Healthy: $url"
}

start_processes() {
  mkdir -p "${GK_RUNTIME_DIR:-/var/run/gravelking}" 2>/dev/null || true
  local runtime_dir="${GK_RUNTIME_DIR:-$ROOT_DIR/.runtime}"
  mkdir -p "$runtime_dir"
  log "Starting API on port ${API_PORT}"
  NODE_ENV=production PORT="$API_PORT" pnpm --filter @workspace/api-server run start \
    >"$runtime_dir/api.log" 2>&1 &
  echo $! >"$runtime_dir/api.pid"
  log "Starting web preview on port ${WEB_PORT}"
  PORT="$WEB_PORT" pnpm --filter @workspace/gravelkingpro run serve \
    >"$runtime_dir/web.log" 2>&1 &
  echo $! >"$runtime_dir/web.pid"
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health"
  wait_for_http "http://127.0.0.1:${WEB_PORT}/"
}

install_base_tools
install_mise_runtimes
install_ffmpeg
build_application
import_schema
start_processes
log "GravelKing Pro is running. API=${API_PORT}, WEB=${WEB_PORT}"