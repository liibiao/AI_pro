#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/firefly-direct-chat-adapter-20260619211229.tar.gz}"
PKG_NAME="firefly-direct-chat-adapter-20260619211229"
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

echo "[deploy] install firefly direct adapter scripts"
install_script "$SRC/api-server/scripts/patch-firefly-direct-chat-adapter.mjs" "$API_ROOT/scripts/patch-firefly-direct-chat-adapter.mjs"
install_script "$SRC/api-server/scripts/repair-firefly-direct-chat-binding.mjs" "$API_ROOT/scripts/repair-firefly-direct-chat-binding.mjs"

echo "[deploy] patch API server adapter and route"
(cd "$API_ROOT" && node scripts/patch-firefly-direct-chat-adapter.mjs)

echo "[deploy] repair Firefly provider/model binding"
(cd "$API_ROOT" && node scripts/repair-firefly-direct-chat-binding.mjs)

echo "[deploy] verify code markers"
node - <<'NODE'
const fs = require('fs');
const files = [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('AIYUNZHI_FIREFLY_DIRECT_CHAT_ADAPTER')) throw new Error(`${file} missing direct adapter marker`);
}
for (const file of files.slice(0, 2)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'aiyunzhi-firefly-gpt-image'")) throw new Error(`${file} missing registry alias`);
  if (!text.includes('submitAiyunzhiFireflyGptImage')) throw new Error(`${file} missing submitter`);
  if (!text.includes('resolveAiyunzhiFireflyDirectModel')) throw new Error(`${file} missing direct model resolver`);
}
for (const file of files.slice(2)) {
  const text = fs.readFileSync(file, 'utf8');
  const fireflyIndex = text.indexOf("return 'aiyunzhi-firefly-gpt-image'");
  const openaiIndex = text.indexOf("return configuredLower");
  if (fireflyIndex < 0) throw new Error(`${file} missing firefly route return`);
  if (openaiIndex >= 0 && fireflyIndex > openaiIndex) throw new Error(`${file} firefly guard is after openai adapter return`);
}
console.log('[verify] code markers ok');
NODE

echo "[deploy] verify dist syntax"
node --check "$API_ROOT/dist/modules/generation/adapters/registry.js"
node --check "$API_ROOT/dist/modules/generation/routes.js"

echo "[deploy] verify DB binding"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { modelKey: { in: ['aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-firefly-gpt-image', 'canvas-aiyunzhi-firefly-gpt-image'] } },
      { modelKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
      { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
    ],
  },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
const targets = models.filter(model => !String(`${model.id} ${model.modelKey} ${model.displayName}`).toLowerCase().includes('gpt-image-2-pro'));
if (!targets.length) throw new Error('no firefly target models found');
for (const model of targets) {
  if (model.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${model.id} adapter=${model.adapter}`);
  if (model.name !== 'firefly-gpt-image') throw new Error(`${model.id} realModel=${model.name}`);
  if (model.endpointPath !== '/v1/chat/completions') throw new Error(`${model.id} endpointPath=${model.endpointPath}`);
  if (model.protocol?.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${model.id} protocol adapter=${model.protocol?.adapter}`);
  if (model.provider?.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${model.id} provider adapter=${model.provider?.adapter}`);
  if (!model.provider?.apiKeyEncrypted) throw new Error(`${model.id} provider missing API key`);
  console.log(`[verify] ${model.id} key=${model.modelKey} real=${model.name} adapter=${model.adapter} provider=${model.provider.providerKey}/${model.provider.adapter}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
pm2_run restart ai-admin-api --update-env >/dev/null
pm2_run status ai-admin-api --no-color | sed -n '1,8p'

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
