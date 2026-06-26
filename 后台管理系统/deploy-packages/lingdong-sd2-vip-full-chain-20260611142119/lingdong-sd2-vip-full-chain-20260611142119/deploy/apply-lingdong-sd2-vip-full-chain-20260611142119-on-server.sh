#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="lingdong-sd2-vip-full-chain-20260611142119"
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
  if [ -e "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    if [ -d "$dest" ]; then
      run_sudo mkdir -p "$BACKUP_DIR/$rel"
      run_sudo cp -a "$dest/." "$BACKUP_DIR/$rel/"
    else
      run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
    fi
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
  backup_one "$dest"
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed directory $dest"
}

log "verify package markers"
grep -Fq "lingdong-sd-2-vip" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "LINGDONG_SD2_VIP_AUDIO_REQUIRES_VISUAL" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "function isPlaceholderSecret" "$SRC/api-server/dist/apply-lingdong-sd2-vip-channel.js"
grep -Fq "SYNC_CANVAS_MODELS_ALLOW_ADMIN_RESET" "$SRC/api-server/dist/sync-canvas-models.js"
grep -Fq '"endpointPath": "/videos"' "$SRC/tools/workbench-web/models/lingdong-sd-2-vip.json"
grep -Fq '"statusEndpointPath": "/video/generations/{taskId}"' "$SRC/tools/workbench-web/models/lingdong-sd-2-vip.json"
grep -Fq "lingdongSd2VipOrientationForAspectRatio" "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
install_file "package.json" "$APP_DIR/package.json"
for rel in \
  api-server/package.json \
  api-server/src/modules/generation/adapters/registry.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/src/modules/models/routes.ts \
  api-server/src/sync-canvas-models.ts \
  api-server/src/apply-lingdong-sd2-vip-channel.ts \
  api-server/dist/modules/generation/adapters/registry.js \
  api-server/dist/modules/generation/routes.js \
  api-server/dist/modules/models/routes.js \
  api-server/dist/sync-canvas-models.js \
  api-server/dist/apply-lingdong-sd2-vip-channel.js; do
  install_file "$rel" "$APP_DIR/$rel"
done

log "install admin model management"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

log "install production canvas assets"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/model-registry.json" "$WEB_ROOT/model-registry.json"
install_file "tools/workbench-web/model-registry.json" "$WEB_ROOT/workbench-web/model-registry.json"
install_file "tools/workbench-web/model-registry.json" "$WEB_ROOT/tools/workbench-web/model-registry.json"
install_file "tools/workbench-web/models/lingdong-sd-2-vip.json" "$WEB_ROOT/models/lingdong-sd-2-vip.json"
install_file "tools/workbench-web/models/lingdong-sd-2-vip.json" "$WEB_ROOT/workbench-web/models/lingdong-sd-2-vip.json"
install_file "tools/workbench-web/models/lingdong-sd-2-vip.json" "$WEB_ROOT/tools/workbench-web/models/lingdong-sd-2-vip.json"
install_file "tools/workbench-web/canvas-next/generator-adapters.js" "$WEB_ROOT/canvas-next/generator-adapters.js"
install_file "tools/workbench-web/canvas-next/generator-adapters.js" "$WEB_ROOT/workbench-web/canvas-next/generator-adapters.js"
install_file "tools/workbench-web/canvas-next/generator-adapters.js" "$WEB_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
install_file "tools/workbench-web/canvas-next/generation-service.js" "$WEB_ROOT/canvas-next/generation-service.js"
install_file "tools/workbench-web/canvas-next/generation-service.js" "$WEB_ROOT/workbench-web/canvas-next/generation-service.js"
install_file "tools/workbench-web/canvas-next/generation-service.js" "$WEB_ROOT/tools/workbench-web/canvas-next/generation-service.js"

if [ -d "$MIRROR_ROOT" ]; then
  log "install source mirror and compatibility services"
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  install_file "tools/workbench-web/model-registry.json" "$MIRROR_ROOT/tools/workbench-web/model-registry.json"
  install_file "tools/workbench-web/models/lingdong-sd-2-vip.json" "$MIRROR_ROOT/tools/workbench-web/models/lingdong-sd-2-vip.json"
  install_file "tools/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
  install_file "tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"
  install_file "tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py"
  install_file "smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/models/lingdong-sd-2-vip.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/lingdong-sd-2-vip.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
  install_file "smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
else
  log "mirror root missing, skip $MIRROR_ROOT"
fi

API_DIR="$APP_DIR/api-server"
log "create missing Lingdong sd-2-vip rows without overwriting admin edits"
run_sudo bash -lc "cd '$API_DIR' && node dist/apply-lingdong-sd2-vip-channel.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify database model/provider"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const model = await prisma.aiModel.findFirst({
  where: { OR: [{ id: 'canvas-lingdong-sd-2-vip' }, { modelKey: 'lingdong-sd-2-vip' }] },
  include: { provider: true },
});
if (!model) throw new Error('missing canvas-lingdong-sd-2-vip model row');
if (model.adapter !== 'lingdong-sd-2-vip') throw new Error(`unexpected adapter: ${model.adapter}`);
if (!model.provider || model.provider.providerKey !== 'lingdong-sd-2-vip') throw new Error('missing lingdong provider row');
if (model.endpointPath !== '/videos') throw new Error(`unexpected endpointPath: ${model.endpointPath}`);
if (model.statusEndpointPath !== '/video/generations/{taskId}') throw new Error(`unexpected statusEndpointPath: ${model.statusEndpointPath}`);
console.log(`${model.id}: modelStatus=${model.status} providerStatus=${model.provider.status} unit=${model.unit} salePrice=${model.salePrice}`);
await prisma.$disconnect();
NODE

log "verify served assets and api health"
grep -Fq "lingdong-sd-2-vip" "$WEB_ROOT/tools/workbench-web/models/lingdong-sd-2-vip.json"
grep -Fq "lingdong-sd-2-vip" "$WEB_ROOT/models/lingdong-sd-2-vip.json"
grep -Fq "lingdongSd2VipOrientationForAspectRatio" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
grep -Fq "lingdong-sd-2-vip" "$WEB_ROOT/canvas-next/generation-service.js"
grep -Fq "isPlaceholderSecret" "$APP_DIR/api-server/dist/apply-lingdong-sd2-vip-channel.js"
# The public nginx config intentionally blocks /models/*.json; verify exposed
# registry/runtime markers instead and keep model JSON checked on disk above.
curl -fsS http://127.0.0.1/model-registry.json | grep -Fq "lingdong-sd-2-vip"
curl -fsS http://127.0.0.1/canvas-next/generation-service.js | grep -Fq "lingdong-sd-2-vip"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done; no overwrite sync was executed"
echo "backup: $BACKUP_DIR"
