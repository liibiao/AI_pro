#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-image-aspect-ratio-fix-20260606012939"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
CLIPROXY_XAI_BASE_URL="${CLIPROXY_XAI_BASE_URL:-http://45.77.211.38:8317/v1}"
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

API_SRC="$SRC_ROOT/ai-admin-platform/api-server/src"
API_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist"
WORKBENCH_SRC="$SRC_ROOT/workbench-web"
TOOLS_WORKBENCH_SRC="$SRC_ROOT/tools/workbench-web"

[ -f "$API_SRC/modules/generation/adapters/registry.ts" ] || fail "package missing registry.ts"
[ -f "$API_DIST/modules/generation/adapters/registry.js" ] || fail "package missing registry.js"
[ -f "$API_SRC/apply-grok-media-channel.ts" ] || fail "package missing apply-grok-media-channel.ts"
[ -f "$API_DIST/apply-grok-media-channel.js" ] || fail "package missing apply-grok-media-channel.js"
for rel in image-studio-canvas-next.html canvas-next/app.js canvas-next/generation-service.js models/grok-image.json; do
  [ -f "$WORKBENCH_SRC/$rel" ] || fail "package missing workbench file: $rel"
  [ -f "$TOOLS_WORKBENCH_SRC/$rel" ] || fail "package missing tools workbench file: $rel"
done

log "verify package markers"
grep -Fq "aspect_ratio: geometry.aspectRatio" "$API_SRC/modules/generation/adapters/registry.ts"
grep -Fq "form.set('aspect_ratio', geometry.aspectRatio)" "$API_SRC/modules/generation/adapters/registry.ts"
grep -Fq "resolveGrokImageRequestGeometry" "$API_DIST/modules/generation/adapters/registry.js"
grep -Fq "1536x1024" "$API_SRC/modules/generation/adapters/registry.ts"
grep -Fq "size: '16:9', aspectRatio: '16:9'" "$API_SRC/apply-grok-media-channel.ts"
grep -Fq "payload.aspect_ratio=payloadRatio" "$WORKBENCH_SRC/image-studio-canvas-next.html"
grep -Fq "1792×1024" "$WORKBENCH_SRC/image-studio-canvas-next.html"
grep -Fq "'16:9':'1792x1024'" "$WORKBENCH_SRC/canvas-next/generation-service.js"
grep -Fq '"size": "16:9"' "$WORKBENCH_SRC/models/grok-image.json"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web/public" \
  "$BACKUP_DIR/workbench-web/mirror"

run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/apply-grok-media-channel.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-grok-media-channel.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/apply-grok-media-channel.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-grok-media-channel.js" 2>/dev/null || true

log "install api-server files"
run_sudo mkdir -p "$APP_DIR/api-server/src/modules/generation/adapters" "$APP_DIR/api-server/dist/modules/generation/adapters"
run_sudo install -m 0644 "$API_SRC/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$API_DIST/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$API_SRC/apply-grok-media-channel.ts" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo install -m 0644 "$API_DIST/apply-grok-media-channel.js" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"

backup_workbench_file(){
  local dest="$1"
  local label="$2"
  [ -f "$dest" ] || return 0
  local rel_path="${dest#/}"
  local backup_dir="$BACKUP_DIR/workbench-web/$label/$(dirname "$rel_path")"
  run_sudo mkdir -p "$backup_dir"
  run_sudo cp -a "$dest" "$backup_dir/"
}

install_workbench_into(){
  local src_root="$1"
  local dest_root="$2"
  local label="$3"
  run_sudo test -d "$dest_root" || return 1
  log "install workbench $label: $dest_root"
  for rel in image-studio-canvas-next.html canvas-next/app.js canvas-next/generation-service.js models/grok-image.json; do
    run_sudo mkdir -p "$dest_root/$(dirname "$rel")"
    backup_workbench_file "$dest_root/$rel" "$label"
    run_sudo install -m 0644 "$src_root/$rel" "$dest_root/$rel"
  done
  run_sudo grep -Fq "payload.aspect_ratio=payloadRatio" "$dest_root/image-studio-canvas-next.html"
  run_sudo grep -Fq "'16:9':'1792x1024'" "$dest_root/canvas-next/generation-service.js"
  run_sudo grep -Fq '"size": "16:9"' "$dest_root/models/grok-image.json"
  return 0
}

installed_workbench=0
if install_workbench_into "$WORKBENCH_SRC" "$WORKBENCH_DIR" "public"; then
  installed_workbench=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi
MIRROR_WORKBENCH_DIR="$MIRROR_TARGET/tools/workbench-web"
if install_workbench_into "$TOOLS_WORKBENCH_SRC" "$MIRROR_WORKBENCH_DIR" "mirror"; then
  installed_workbench=1
else
  log "mirror workbench skipped, not found: $MIRROR_WORKBENCH_DIR"
fi
[ "$installed_workbench" -eq 1 ] || fail "no workbench target found"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged dist"
    run_sudo install -m 0644 "$API_DIST/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
    run_sudo install -m 0644 "$API_DIST/apply-grok-media-channel.js" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

patch_grok_image_db_defaults(){
  run_sudo env APP_DIR="$APP_DIR" bash <<'DBPATCH'
set -euo pipefail
cd "$APP_DIR/api-server"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const defaults = { size: '16:9', aspectRatio: '16:9', resolution: '1K' };
const capabilities = {
  aspectRatios: ['1:1', '16:9', '9:16', '3:2', '2:3'],
  resolutions: ['1K'],
  sizes: ['1024x1024', '1792x1024', '1024x1792', '1536x1024', '1024x1536'],
};
await prisma.aiModel.updateMany({
  where: { id: 'cliproxy-grok-image' },
  data: { defaults, capabilities },
});
await prisma.$disconnect();
NODE
DBPATCH
}

log "apply Grok image defaults in database"
patch_grok_image_db_defaults || log "database default patch skipped/failed"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "aspect_ratio: geometry.aspectRatio" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "resolveGrokImageRequestGeometry" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
if run_sudo test -d "$WORKBENCH_DIR"; then
  run_sudo grep -Fq "payload.aspect_ratio=payloadRatio" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "'16:9':'1792x1024'" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "canvas refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$PKG"
