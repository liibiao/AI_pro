#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="preserve-admin-sd2-model-edits-20260611112519"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
run_sudo(){ if [ -n "$SUDO" ]; then $SUDO "$@"; else "$@"; fi; }

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root missing"

grep -Fq "SYNC_CANVAS_MODELS_ALLOW_ADMIN_RESET" "$SRC/api-server/dist/sync-canvas-models.js"
grep -Fq "raw.resolutions||override.resolutions" "$SRC/tools/workbench-web/image-studio-canvas-next.html"

install_file(){
  local rel="$1" dest="$2"
  [ -f "$SRC/$rel" ] || fail "missing $rel"
  run_sudo mkdir -p "$BACKUP_DIR/${dest#/}" "$(dirname "$dest")"
  if [ -f "$dest" ]; then run_sudo cp -p "$dest" "$BACKUP_DIR/${dest#/}.bak"; fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_file "api-server/src/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts"
install_file "api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

# Deliberately do not run sync-canvas-models: existing database values stay untouched.
curl -fsS http://127.0.0.1/image-studio-canvas-next.html | grep -Fq "raw.resolutions||override.resolutions"
grep -Fq "SYNC_CANVAS_MODELS_ALLOW_ADMIN_RESET" "$APP_DIR/api-server/dist/sync-canvas-models.js"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done; database models were not synchronized or modified"
echo "backup: $BACKUP_DIR"
