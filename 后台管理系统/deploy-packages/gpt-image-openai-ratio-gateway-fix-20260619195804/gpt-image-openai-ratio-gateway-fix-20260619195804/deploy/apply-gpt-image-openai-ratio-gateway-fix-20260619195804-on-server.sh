#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt-image-openai-ratio-gateway-fix-20260619195804"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

ROUTE_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
ROUTE_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"
REG_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
REG_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
[ -f "$ROUTE_SRC" ] || fail "package missing routes.ts"
[ -f "$ROUTE_DIST" ] || fail "package missing routes.js"
[ -f "$REG_SRC" ] || fail "package missing registry.ts"
[ -f "$REG_DIST" ] || fail "package missing registry.js"

log "verify package markers"
grep -Fq "function openAiImageGeometryOptions" "$REG_SRC"
grep -Fq "aspect_ratio: aspectRatio" "$REG_SRC"
grep -Fq "'16:9': '1280x720'" "$REG_SRC"
grep -Fq "configuredLower === 'gpt-image-v2'" "$ROUTE_SRC"
grep -Fq "return 'openai-edits';" "$ROUTE_SRC"
! grep -Fq "isCanvasGptImage2ProGenerationHint" "$ROUTE_SRC"
grep -Fq "function openAiImageGeometryOptions" "$REG_DIST"
grep -Fq "aspect_ratio: aspectRatio" "$REG_DIST"
grep -Fq "'16:9': '1280x720'" "$REG_DIST"
grep -Fq "configuredLower === 'gpt-image-v2'" "$ROUTE_DIST"
! grep -Fq "isCanvasGptImage2ProGenerationHint" "$ROUTE_DIST"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation"
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

log "install api generation gateway files"
run_sudo install -m 0644 "$ROUTE_SRC" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$REG_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$ROUTE_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$REG_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "function openAiImageGeometryOptions" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "aspect_ratio: aspectRatio" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "'16:9': '1280x720'" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "configuredLower === 'gpt-image-v2'" "$APP_DIR/api-server/dist/modules/generation/routes.js"
! run_sudo grep -Fq "isCanvasGptImage2ProGenerationHint" "$APP_DIR/api-server/dist/modules/generation/routes.js"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
