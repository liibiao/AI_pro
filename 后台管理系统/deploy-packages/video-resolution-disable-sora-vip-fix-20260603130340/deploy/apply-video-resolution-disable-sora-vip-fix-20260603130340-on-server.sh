#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-resolution-disable-sora-vip-fix-20260603130340"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_NAME" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
grep -Fq "停用分辨率" "$SRC/ai-admin-platform/admin-web/src/main.tsx"
grep -Fq "disabledVideoResolutions" "$SRC/ai-admin-platform/admin-web/src/main.tsx"
grep -Fq "sora-3.0-vip" "$SRC/ai-admin-platform/admin-web/src/main.tsx"
grep -Rqs "停用分辨率" "$SRC/ai-admin-platform/admin-web/dist"
grep -Fq "normalizeVideoDisabledResolutions" "$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts"
grep -Fq "sora-3.0-vip" "$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts"
grep -Fq "disabledVideoResolutions" "$SRC/ai-admin-platform/api-server/dist/modules/models/routes.js"
grep -Fq "normalizeVideoDisabledResolutionList" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "getModelDisabledVideoResolutions" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "disabledResolutions=getModelDisabledVideoResolutions" "$SRC/workbench-web/image-studio-canvas-next.html"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror-workbench-web"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$MIRROR_DIR" ]; then
  run_sudo cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install admin web"
run_sudo install -m 0644 "$SRC/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$SRC/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "install api model routes"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/modules/models/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"

log "install workbench html"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "verify installed markers"
run_sudo grep -Fq "停用分辨率" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "sora-3.0-vip" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Rqs "停用分辨率" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Fq "normalizeVideoDisabledResolutions" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "disabledVideoResolutions" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "sora-3.0-vip" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "normalizeVideoDisabledResolutionList" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "getModelDisabledVideoResolutions" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "disabledResolutions=getModelDisabledVideoResolutions" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh admin and canvas pages after deploy."
