#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="artifex-seedance2-full-chain-20260611040410"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ] && [ -d "$candidate/admin-web" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"
command -v node >/dev/null 2>&1 || fail "node is required"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi
run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}
backup_one(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$2"
  need_file "$rel"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}
install_dir(){
  local rel="$1"
  local dest="$2"
  [ -d "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$dest"
  if [ -d "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/${dest#/}"
    run_sudo cp -a "$dest/." "$BACKUP_DIR/${dest#/}/"
  fi
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed directory $dest"
}

log "verify package markers"
grep -Fq "seedance-2-pro-1080p" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "SEEDANCE2_PROMPT_TOO_LONG" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "Artifex Seedance 2 /videos" "$SRC/admin-web/src/main.tsx"
grep -Fq '"chargedCreditsPerGeneration": 700' "$SRC/tools/workbench-web/models/seedance2-pro-1080p.json"
grep -Fq "pollDelayMs" "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install 124 api-server"
for rel in \
  api-server/src/modules/generation/adapters/registry.ts \
  api-server/src/modules/models/routes.ts \
  api-server/src/sync-canvas-models.ts \
  api-server/src/apply-artifex-seedance2-channels.ts \
  api-server/dist/modules/generation/adapters/registry.js \
  api-server/dist/modules/models/routes.js \
  api-server/dist/sync-canvas-models.js \
  api-server/dist/apply-artifex-seedance2-channels.js \
  api-server/package.json; do
  install_file "$rel" "$APP_DIR/$rel"
done

log "install admin model management"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

log "install production canvas"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/model-registry.json" "$WEB_ROOT/workbench-web/model-registry.json"
install_file "tools/workbench-web/model-registry.json" "$WEB_ROOT/tools/workbench-web/model-registry.json"
for model_json in seedance2-fast.json seedance2-pro.json seedance2-pro-1080p.json; do
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/workbench-web/models/$model_json"
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/tools/workbench-web/models/$model_json"
done

if [ -d "$MIRROR_ROOT" ]; then
  log "install source mirror and compatibility service"
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  install_file "tools/workbench-web/model-registry.json" "$MIRROR_ROOT/tools/workbench-web/model-registry.json"
  install_file "tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py"
  install_file "smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
  install_file "smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
  for model_json in seedance2-fast.json seedance2-pro.json seedance2-pro-1080p.json; do
    install_file "tools/workbench-web/models/$model_json" "$MIRROR_ROOT/tools/workbench-web/models/$model_json"
    install_file "smart-vision/canvas/legacy-workbench/workbench-web/models/$model_json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/$model_json"
  done
else
  log "mirror root missing, skip $MIRROR_ROOT"
fi

API_DIR="$APP_DIR/api-server"
log "upsert three Artifex Seedance 2 channels"
run_sudo bash -lc "cd '$API_DIR' && node dist/apply-artifex-seedance2-channels.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify database models"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const ids = ['canvas-seedance2-fast', 'canvas-seedance2-pro', 'canvas-seedance2-pro-1080p'];
const rows = await prisma.aiModel.findMany({ where: { id: { in: ids } }, include: { provider: true } });
for (const id of ids) {
  const row = rows.find(item => item.id === id);
  if (!row || row.status !== 'ACTIVE' || row.provider.status !== 'ACTIVE') throw new Error(`inactive or missing: ${id}`);
  console.log(`${row.id}: ${row.provider.providerKey} ${row.name} ${row.salePrice} ${row.unit}`);
}
await prisma.$disconnect();
NODE

grep -Fq "seedance-2-pro-1080p" "$WEB_ROOT/workbench-web/models/seedance2-pro-1080p.json"
grep -Fq "Artifex Seedance 2 /videos" "$APP_DIR/admin-web/dist/assets/"*.js
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done"
echo "backup: $BACKUP_DIR"
