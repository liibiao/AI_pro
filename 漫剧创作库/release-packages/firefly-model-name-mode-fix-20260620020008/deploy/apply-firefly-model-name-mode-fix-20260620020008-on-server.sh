#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/firefly-model-name-mode-fix-20260620020008.tar.gz}"
PKG_NAME="firefly-model-name-mode-fix-20260620020008"
API_ROOT="${API_ROOT:-/var/www/ai-admin/ai-admin-platform/api-server}"
PUBLIC_DIR="${PUBLIC_DIR:-/var/www/ai-admin/workbench-web}"
REPO_ROOT="${REPO_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_DIR="${MIRROR_DIR:-$REPO_ROOT/tools/workbench-web}"
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

install_file() {
  local src="$1" dest="$2" mode="${3:-644}"
  [ -f "$src" ] || { echo "[deploy] missing file: $src" >&2; exit 1; }
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod "$mode" "$dest"
  echo "[deploy] installed $dest"
}

verify_frontend_file() {
  local file="$1"
  grep -Fq "function shouldAssembleFireflyGptImageModelName(model={})" "$file"
  grep -Fq "modelNameMode" "$file"
  grep -Fq "firefly-gpt-image').trim().replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i,'')||'firefly-gpt-image'" "$file"
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
SRC="${WORK_DIR}/${PKG_NAME}"
[ -d "$SRC" ] || { echo "[deploy] package root not found: $SRC" >&2; exit 1; }

echo "[deploy] backup dir: ${BACKUP_DIR}"
run_sudo mkdir -p "$BACKUP_DIR"

echo "[deploy] install workbench frontend"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_DIR/image-studio-canvas-next.html"
install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$PUBLIC_DIR/canvas-next/generation-service.js"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_DIR/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_DIR/canvas-next/generation-service.js"

echo "[deploy] install API patch scripts"
install_file "$SRC/api-server/scripts/patch-firefly-model-name-mode.mjs" "$API_ROOT/scripts/patch-firefly-model-name-mode.mjs" 755
install_file "$SRC/api-server/scripts/repair-firefly-model-name-mode.mjs" "$API_ROOT/scripts/repair-firefly-model-name-mode.mjs" 755

echo "[deploy] patch Firefly adapter model-name mode"
(cd "$API_ROOT" && node scripts/patch-firefly-model-name-mode.mjs)

echo "[deploy] repair Firefly model-management mode flags"
(cd "$API_ROOT" && node scripts/repair-firefly-model-name-mode.mjs)

echo "[deploy] verify frontend markers"
verify_frontend_file "$PUBLIC_DIR/image-studio-canvas-next.html"
verify_frontend_file "$PUBLIC_DIR/canvas-next/generation-service.js"
verify_frontend_file "$MIRROR_DIR/image-studio-canvas-next.html"
verify_frontend_file "$MIRROR_DIR/canvas-next/generation-service.js"

echo "[deploy] verify API markers"
node - <<'NODE'
const fs = require('fs');
const required = '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js';
const optional = '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts';
for (const file of [required]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('AIYUNZHI_FIREFLY_MODEL_NAME_MODE')) throw new Error(`${file} missing model-name-mode marker`);
  if (!text.includes('shouldAssembleAiyunzhiFireflyDirectModel')) throw new Error(`${file} missing assemble mode helper`);
  if (!text.includes('normalizeAiyunzhiFireflyLiteralModel')) throw new Error(`${file} missing literal model helper`);
}
if (fs.existsSync(optional)) {
  const text = fs.readFileSync(optional, 'utf8');
  if (text.includes('resolveAiyunzhiFireflyDirectModel')) {
    if (!text.includes('AIYUNZHI_FIREFLY_MODEL_NAME_MODE')) throw new Error(`${optional} has direct adapter but missing model-name-mode marker`);
  } else {
    console.log('[verify] optional source registry has no direct adapter block; runtime dist verified');
  }
}
console.log('[verify] API markers ok');
NODE

echo "[deploy] verify dist syntax"
node --check "$API_ROOT/dist/modules/generation/adapters/registry.js"

echo "[deploy] verify DB model-name modes"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { modelKey: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { adapter: 'aiyunzhi-firefly-gpt-image' },
    ],
  },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
const targets = models.filter(model => !String(`${model.id} ${model.modelKey} ${model.displayName}`).toLowerCase().includes('gpt-image-2-pro'));
if (!targets.length) throw new Error('no firefly target models found');
for (const model of targets) {
  const text = `${model.id} ${model.modelKey} ${model.provider?.providerKey || ''}`.toLowerCase().replace(/[\s_]+/g, '-');
  const expected = text.includes('aiyunzhi-gpt-image-2') ? 'literal' : 'template';
  const actual = String(model.protocol?.modelNameMode || model.protocol?.model_name_mode || model.modelAssembly?.type || '').toLowerCase();
  if (actual !== expected) throw new Error(`${model.id} modelNameMode=${actual}, expected ${expected}`);
  console.log(`[verify] ${model.id} provider=${model.provider?.providerKey || ''} modelNameMode=${actual} real=${model.name}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
pm2_run restart ai-admin-api --update-env >/dev/null
pm2_run status ai-admin-api --no-color | sed -n '1,8p'

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
echo "Hard-refresh the canvas page after deploy."
