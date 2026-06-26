#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aistartlab-admin-model-config-20260626001852"
ARCHIVE="${1:?usage: apply-aistartlab-admin-model-config-20260626001852-on-server.sh <archive.tar.gz>}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
API_DIR="${API_DIR:-$REMOTE_ROOT/ai-admin-platform/api-server}"
MODEL_JSON="${AISTARTLAB_MODEL_JSON:-$REMOTE_ROOT/workbench-web/models/aistartlab-video-test.json}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

run_sudo(){
  "$@" && return 0
  local rc=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$rc"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$rc"
  fi
}

pm2_run(){
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_DIR" || fail "api dir not found: $API_DIR"
command -v node >/dev/null 2>&1 || fail "node not found on remote"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -f "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs" ] || fail "package missing admin model config script"
grep -Fq "aistartlab-video-test" "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs"
grep -Fq "aistartlab-video" "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs"
grep -Fq "api.video.aistarslab.com" "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs"
grep -Fq "existing-provider" "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
run_sudo cp -p "$API_DIR/scripts/apply-aistartlab-admin-model-config.mjs" "$BACKUP_DIR/apply-aistartlab-admin-model-config.mjs.prev" 2>/dev/null || true

log "install admin model config script"
run_sudo mkdir -p "$API_DIR/scripts"
run_sudo cp -p "$SRC/api-server/scripts/apply-aistartlab-admin-model-config.mjs" "$API_DIR/scripts/apply-aistartlab-admin-model-config.mjs"
run_sudo chmod 644 "$API_DIR/scripts/apply-aistartlab-admin-model-config.mjs"

log "apply AIStartLab admin provider/model rows"
(cd "$API_DIR" && AISTARTLAB_MODEL_JSON="$MODEL_JSON" node scripts/apply-aistartlab-admin-model-config.mjs)

log "verify AIStartLab admin rows"
(cd "$API_DIR" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const provider = await prisma.upstreamProvider.findFirst({
  where: { providerKey: 'aistartlab-video' },
  include: { models: true },
});
if (!provider) throw new Error('missing provider aistartlab-video');
if (provider.type !== 'VIDEO') throw new Error(`provider type=${provider.type}`);
if (provider.adapter !== 'aistartlab-video') throw new Error(`provider adapter=${provider.adapter}`);
if (provider.baseUrl !== 'https://api.video.aistarslab.com/openapi') throw new Error(`provider baseUrl=${provider.baseUrl}`);
if (provider.endpointPath !== '/video/task/v2') throw new Error(`provider endpointPath=${provider.endpointPath}`);
if (provider.statusEndpointPath !== '/video/task/status') throw new Error(`provider statusEndpointPath=${provider.statusEndpointPath}`);
const model = await prisma.aiModel.findFirst({
  where: { modelKey: 'aistartlab-video-test' },
  include: { provider: true },
});
if (!model) throw new Error('missing model aistartlab-video-test');
if (model.type !== 'VIDEO') throw new Error(`model type=${model.type}`);
if (model.adapter !== 'aistartlab-video') throw new Error(`model adapter=${model.adapter}`);
if (model.provider?.providerKey !== 'aistartlab-video') throw new Error(`model provider=${model.provider?.providerKey}`);
if (model.endpointPath !== '/video/task/v2') throw new Error(`model endpointPath=${model.endpointPath}`);
if (model.statusEndpointPath !== '/video/task/status') throw new Error(`model statusEndpointPath=${model.statusEndpointPath}`);
if (model.protocol?.channel !== 'test') throw new Error(`model protocol channel=${model.protocol?.channel}`);
if (model.protocol?.model !== 'test-video') throw new Error(`model protocol model=${model.protocol?.model}`);
console.log(`[verify] provider=${provider.providerKey} status=${provider.status} key=${provider.apiKeyEncrypted ? 'configured' : 'empty'}`);
console.log(`[verify] model=${model.id} modelKey=${model.modelKey} status=${model.status} salePrice=${model.salePrice}`);
await prisma.$disconnect();
NODE
)

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped, app not found: $PM2_APP"
fi

log "done: $PKG"
echo "backup: $BACKUP_DIR"
