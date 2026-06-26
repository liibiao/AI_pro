#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="zaomeng-seedance2-full-chain-20260611221348"
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
grep -Fq "ZAOMENG_SEEDANCE2_PROMPT_REQUIRED" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "extractZaomengSeedance2PollTaskId" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "zaomeng-seedance2-files" "$SRC/api-server/dist/apply-zaomeng-seedance2-channels.js"
grep -Fq "Zaomeng Seedance 2.0 channel apply complete" "$SRC/api-server/dist/apply-zaomeng-seedance2-channels.js"
grep -Fq '"statusEndpointPath": "/v1/videos/{taskId}"' "$SRC/tools/workbench-web/models/zaomeng-seedance2-svip.json"
grep -Fq "isZaomengSeedance2VideoModel" "$SRC/tools/workbench-web/image-studio-canvas-next.html"
grep -Fq "build_zaomeng_seedance2_request_body" "$SRC/tools/image_studio_backend.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
install_file "package.json" "$APP_DIR/package.json"
for rel in \
  api-server/package.json \
  api-server/src/modules/generation/adapters/registry.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/src/modules/models/routes.ts \
  api-server/src/modules/workbench-compat/routes.ts \
  api-server/src/sync-canvas-models.ts \
  api-server/src/apply-zaomeng-seedance2-channels.ts \
  api-server/dist/modules/generation/adapters/registry.js \
  api-server/dist/modules/generation/routes.js \
  api-server/dist/modules/models/routes.js \
  api-server/dist/modules/workbench-compat/routes.js \
  api-server/dist/sync-canvas-models.js \
  api-server/dist/apply-zaomeng-seedance2-channels.js; do
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
for model_json in zaomeng-seedance2-svip.json zaomeng-seedance2-fast.json; do
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/models/$model_json"
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/workbench-web/models/$model_json"
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/tools/workbench-web/models/$model_json"
done
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
  install_file "tools/workbench-web/models/zaomeng-seedance2-svip.json" "$MIRROR_ROOT/tools/workbench-web/models/zaomeng-seedance2-svip.json"
  install_file "tools/workbench-web/models/zaomeng-seedance2-fast.json" "$MIRROR_ROOT/tools/workbench-web/models/zaomeng-seedance2-fast.json"
  install_file "tools/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
  install_file "tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"
  install_file "tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py"
  install_file "smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/models/zaomeng-seedance2-svip.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/zaomeng-seedance2-svip.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/models/zaomeng-seedance2-fast.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/zaomeng-seedance2-fast.json"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
  install_file "smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
else
  log "mirror root missing, skip $MIRROR_ROOT"
fi

API_DIR="$APP_DIR/api-server"
log "create missing Zaomeng Seedance 2.0 rows without overwriting admin edits"
run_sudo bash -lc "cd '$API_DIR' && node dist/apply-zaomeng-seedance2-channels.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify database model/provider and optional upstream balance"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
import { decryptSecret } from './dist/security.js';

const provider = await prisma.upstreamProvider.findFirst({ where: { providerKey: 'zaomeng-seedance2' } });
if (!provider) throw new Error('missing zaomeng provider row');
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: ['zaomeng-seedance2-svip', 'zaomeng-seedance2-fast'] } },
  include: { provider: true },
});
for (const key of ['zaomeng-seedance2-svip', 'zaomeng-seedance2-fast']) {
  const model = models.find(item => item.modelKey === key);
  if (!model) throw new Error(`missing model row: ${key}`);
  if (model.adapter !== 'zaomeng-seedance2') throw new Error(`unexpected adapter for ${key}: ${model.adapter}`);
  if (model.endpointPath !== '/v1/video/generations') throw new Error(`unexpected endpointPath for ${key}: ${model.endpointPath}`);
  if (model.statusEndpointPath !== '/v1/videos/{taskId}') throw new Error(`unexpected statusEndpointPath for ${key}: ${model.statusEndpointPath}`);
  const pricing = model.defaults?.pricing || {};
  const tiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers : [];
  const p720 = tiers.find(item => String(item.resolution).toLowerCase() === '720p');
  const p1080 = tiers.find(item => String(item.resolution).toLowerCase() === '1080p');
  if (!p720 || Number(p720.chargedCreditsPerSecond) !== 1) throw new Error(`missing 720p pricing tier for ${key}`);
  if (!p1080 || Number(p1080.chargedCreditsPerSecond) !== 2) throw new Error(`missing 1080p pricing tier for ${key}`);
  console.log(`${model.id}: modelStatus=${model.status} providerStatus=${model.provider.status} endpoint=${model.endpointPath}`);
}

let key = '';
try { key = decryptSecret(provider.apiKeyEncrypted || '').trim(); } catch {}
const placeholder = !key || key === 'replace-me' || key === 'your-api-key' || key.startsWith('replace-with-') || key.toLowerCase().includes('placeholder');
if (provider.status === 'ACTIVE' && !placeholder && typeof fetch === 'function') {
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/v1/balance`, { headers: { Authorization: `Bearer ${key}` } });
    const text = await res.text();
    let balance = '';
    try {
      const json = JSON.parse(text);
      if (json && Object.prototype.hasOwnProperty.call(json, 'balance_seconds')) balance = ` balance_seconds=${json.balance_seconds}`;
    } catch {}
    console.log(`upstream balance probe: status=${res.status}${balance}`);
  } catch (err) {
    console.log(`upstream balance probe skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
} else {
  console.log(`upstream balance probe skipped: providerStatus=${provider.status} placeholderKey=${placeholder}`);
}
await prisma.$disconnect();
NODE

log "verify served assets and api health"
grep -Fq "zaomeng-seedance2" "$WEB_ROOT/tools/workbench-web/models/zaomeng-seedance2-svip.json"
grep -Fq "zaomeng-seedance2" "$WEB_ROOT/tools/workbench-web/models/zaomeng-seedance2-fast.json"
grep -Fq "isZaomengSeedance2VideoModel" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
grep -Fq "zaomengVideoFields" "$WEB_ROOT/tools/workbench-web/canvas-next/generation-service.js"
grep -Fq "Zaomeng Seedance 2.0 channel apply complete" "$APP_DIR/api-server/dist/apply-zaomeng-seedance2-channels.js"
grep -Fq "造梦 Seedance 2.0" "$APP_DIR/admin-web/dist/assets/"*.js
curl -fsS http://127.0.0.1/model-registry.json | grep -Fq "zaomeng-seedance2"
curl -fsS http://127.0.0.1/canvas-next/generation-service.js | grep -Fq "zaomeng-seedance2"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done; no destructive sync was executed"
echo "backup: $BACKUP_DIR"
