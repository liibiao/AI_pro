#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/firefly-chat-endpoint-path-fix-20260620024651.tar.gz}"
PKG_NAME="firefly-chat-endpoint-path-fix-20260620024651"
API_ROOT="${API_ROOT:-/var/www/ai-admin/ai-admin-platform/api-server}"
REPO_ROOT="${REPO_ROOT:-/home/ubuntu/漫剧创作库}"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"
PM2_USER="${PM2_USER:-ubuntu}"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

run_sudo() {
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}

pm2_run() {
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

backup_file() {
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local backup="$BACKUP_DIR/${dest#/}"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_script() {
  local src="$1" dest="$2"
  [ -f "$src" ] || { echo "[deploy] missing script: $src" >&2; exit 1; }
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 755 "$dest"
  echo "[deploy] installed $dest"
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
SRC="${WORK_DIR}/${PKG_NAME}"
[ -d "$SRC" ] || { echo "[deploy] package root not found: $SRC" >&2; exit 1; }

echo "[deploy] backup dir: ${BACKUP_DIR}"
run_sudo mkdir -p "$BACKUP_DIR"

echo "[deploy] install endpoint repair scripts"
install_script "$SRC/api-server/scripts/patch-firefly-chat-endpoint-path.mjs" "$API_ROOT/scripts/patch-firefly-chat-endpoint-path.mjs"
install_script "$SRC/api-server/scripts/repair-firefly-chat-endpoint-path.mjs" "$API_ROOT/scripts/repair-firefly-chat-endpoint-path.mjs"

echo "[deploy] patch Firefly endpoint resolver"
(cd "$API_ROOT" && node scripts/patch-firefly-chat-endpoint-path.mjs)

echo "[deploy] repair Firefly endpoint config"
(cd "$API_ROOT" && node scripts/repair-firefly-chat-endpoint-path.mjs)

echo "[deploy] verify dist marker and syntax"
node - <<'NODE'
const fs = require('fs');
const file = '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js';
const text = fs.readFileSync(file, 'utf8');
if (!text.includes('AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH')) throw new Error('missing endpoint marker in dist registry');
if (!text.includes('resolveAiyunzhiFireflyEndpointPath(ctx)')) throw new Error('Firefly endpoint resolver not used in dist registry');
console.log('[verify] endpoint marker ok');
NODE
node --check "$API_ROOT/dist/modules/generation/adapters/registry.js"

echo "[deploy] verify DB endpoints"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const endpoint = '/v1/chat/completions';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { adapter: 'aiyunzhi-firefly-gpt-image' },
      { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
    ],
  },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
const targets = models.filter(model => !String(`${model.id} ${model.modelKey} ${model.displayName}`).toLowerCase().includes('gpt-image-2-pro'));
if (!targets.length) throw new Error('no Firefly target models found');
for (const model of targets) {
  const p = model.protocol || {};
  if (model.endpointPath !== endpoint) throw new Error(`${model.id} endpointPath=${model.endpointPath}`);
  if ((p.endpointPath || p.endpoint_path) !== endpoint) throw new Error(`${model.id} protocol endpoint=${p.endpointPath || p.endpoint_path}`);
  if (model.provider?.endpointPath !== endpoint) throw new Error(`${model.id} provider endpoint=${model.provider?.endpointPath}`);
  console.log(`[verify] ${model.id} provider=${model.provider?.providerKey || ''} endpoint=${model.endpointPath} protocolEndpoint=${p.endpointPath || p.endpoint_path} mode=${p.modelNameMode || p.model_name_mode || model.modelAssembly?.type || ''}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
pm2_run restart ai-admin-api --update-env >/dev/null
pm2_run status ai-admin-api --no-color | sed -n '1,8p'

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
