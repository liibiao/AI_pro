#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
RELEASE_ID="sora-video-pro-materialize-20260607011234"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups/${RELEASE_ID}-$(date +%Y%m%d%H%M%S)"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "/tmp/${RELEASE_ID}.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

install_file() {
  local rel="$1"
  local src="$TMP_DIR/$rel"
  local dst="$APP_ROOT/$rel"
  if [[ ! -f "$src" ]]; then
    echo "[deploy] package missing $rel" >&2
    exit 1
  fi
  mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
  if [[ -f "$dst" ]]; then
    cp "$dst" "$BACKUP_ROOT/$rel"
  fi
  install -m 0644 "$src" "$dst"
  echo "[deploy] installed $rel"
}

install_file "api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js"

cd "$APP_ROOT"
node --check api-server/dist/modules/generation/adapters/registry.js

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS --max-time 8 http://127.0.0.1:3001/api/health >/dev/null || true
fi

echo "[deploy] backup: $BACKUP_ROOT"
echo "[deploy] done: $RELEASE_ID"
