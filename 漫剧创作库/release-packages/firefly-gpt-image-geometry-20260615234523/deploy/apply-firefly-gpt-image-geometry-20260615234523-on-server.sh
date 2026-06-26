#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="firefly-gpt-image-geometry-20260615234523"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
PUBLIC_WEB="/var/www/ai-admin/workbench-web"
REPO_ROOT="/home/ubuntu/漫剧创作库"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

backup_web_file() {
  local web_dir="$1"
  local rel="$2"
  local target="$web_dir/$rel"
  local backup="$BACKUP_DIR/web/${web_dir//\//_}/$rel"
  if [[ -f "$target" ]]; then
    mkdir -p "$(dirname "$backup")"
    cp -a "$target" "$backup"
  fi
}

copy_common_web_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  backup_web_file "$web_dir" "models/aiyunzhi-gpt-image-2.json"
  backup_web_file "$web_dir" "models/aiyunzhi-firefly-gpt-image.json"
  backup_web_file "$web_dir" "canvas-next/generator-adapters.js"
  backup_web_file "$web_dir" "canvas-next/generation-service.js"
  backup_web_file "$web_dir" "image-studio-canvas-next.html"
  backup_web_file "$web_dir" "image-studio-canvas.html"
  backup_web_file "$web_dir" "model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/aiyunzhi-gpt-image-2.json" "$web_dir/models/aiyunzhi-gpt-image-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$web_dir/models/aiyunzhi-firefly-gpt-image.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/canvas-next/generator-adapters.js" "$web_dir/canvas-next/generator-adapters.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/canvas-next/generation-service.js" "$web_dir/canvas-next/generation-service.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas.html" "$web_dir/image-studio-canvas.html"
  if [[ -f "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" ]]; then
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "$web_dir/model-registry.json"
  fi
  if [[ -f "$web_dir/image-studio-canvas-next.html" || "$web_dir" == "$PUBLIC_WEB" || "$web_dir" == "${REPO_ROOT}/tools/workbench-web" ]]; then
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas-next.html" "$web_dir/image-studio-canvas-next.html"
  fi
}

copy_smart_legacy_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  backup_web_file "$web_dir" "models/aiyunzhi-gpt-image-2.json"
  backup_web_file "$web_dir" "models/aiyunzhi-firefly-gpt-image.json"
  backup_web_file "$web_dir" "canvas-next/generator-adapters.js"
  backup_web_file "$web_dir" "canvas-next/generation-service.js"
  backup_web_file "$web_dir" "image-studio-canvas.html"
  backup_web_file "$web_dir" "model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-gpt-image-2.json" "$web_dir/models/aiyunzhi-gpt-image-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$web_dir/models/aiyunzhi-firefly-gpt-image.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$web_dir/canvas-next/generator-adapters.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$web_dir/canvas-next/generation-service.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$web_dir/image-studio-canvas.html"
  if [[ -f "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" ]]; then
    cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$web_dir/model-registry.json"
  fi
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api" "$BACKUP_DIR/web"

echo "[deploy] sync workbench static files"
copy_common_web_bundle "$PUBLIC_WEB"
copy_common_web_bundle "${REPO_ROOT}/tools/workbench-web"
copy_smart_legacy_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
copy_common_web_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"

echo "[deploy] install admin api script"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-aiyunzhi-firefly-gpt-image-geometry.mjs" \
  "${API_ROOT}/scripts/apply-aiyunzhi-firefly-gpt-image-geometry.mjs"

echo "[deploy] apply admin model config"
(cd "$API_ROOT" && node scripts/apply-aiyunzhi-firefly-gpt-image-geometry.mjs)

echo "[deploy] verify static firefly config"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/workbench-web/models/aiyunzhi-gpt-image-2.json',
  '/var/www/ai-admin/workbench-web/models/aiyunzhi-firefly-gpt-image.json',
]) {
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(model.type || '').toLowerCase() !== 'image') throw new Error(`${file} type=${model.type}`);
  if (model.model !== 'firefly-gpt-image') throw new Error(`${file} model=${model.model}`);
  if (model.protocol?.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${file} adapter=${model.protocol?.adapter}`);
  if (model.modelAssembly?.template !== 'firefly-gpt-image-{resolution}-{aspectRatioSlug}') throw new Error(`${file} missing modelAssembly template`);
  for (const resolution of ['1K', '2K', '4K']) {
    if (!model.capabilities?.imageSizes?.includes(resolution)) throw new Error(`${file} missing ${resolution}`);
  }
  for (const ratio of ['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16']) {
    if (!model.capabilities?.aspectRatios?.includes(ratio)) throw new Error(`${file} missing ${ratio}`);
  }
}
const html = fs.readFileSync('/var/www/ai-admin/workbench-web/image-studio-canvas-next.html', 'utf8');
if (!html.includes('assembleFireflyGptImageModelName')) throw new Error('canvas-next missing firefly model assembly');
if (!html.includes('forceAiyunzhiFireflyGptImageProtocol')) throw new Error('canvas-next missing firefly protocol guard');
if (!html.includes('looksLikeAiyunzhiFireflyGptImageModel')) throw new Error('canvas-next missing firefly type guard');
if (!html.includes('aiyunzhi-gpt-image-2')) throw new Error('canvas-next missing GPT Image 2 firefly adapter compatibility');
const registry = fs.readFileSync('/var/www/ai-admin/workbench-web/model-registry.json', 'utf8');
if (!registry.includes('"configId": "aiyunzhi-gpt-image-2"') || !registry.includes('"adapter": "aiyunzhi-firefly-gpt-image"')) {
  throw new Error('model registry missing GPT Image 2 firefly adapter');
}
const service = fs.readFileSync('/var/www/ai-admin/workbench-web/canvas-next/generation-service.js', 'utf8');
if (!service.includes('assembleFireflyGptImageModelName')) throw new Error('generation service missing firefly model assembly');
if (!service.includes('forceAiyunzhiFireflyGptImageModelConfig')) throw new Error('generation service missing firefly protocol guard');
const adapters = fs.readFileSync('/var/www/ai-admin/workbench-web/canvas-next/generator-adapters.js', 'utf8');
if (!adapters.includes('looksLikeAiyunzhiFireflyGptImageModel')) throw new Error('generator adapters missing firefly type guard');
console.log('[verify] static firefly config ok');
NODE

echo "[deploy] verify admin db config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: ['aiyunzhi-gpt-image-2', 'aiyunzhi-firefly-gpt-image'] } },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
const keys = new Set(models.map(model => model.modelKey));
for (const key of ['aiyunzhi-gpt-image-2', 'aiyunzhi-firefly-gpt-image']) {
  if (!keys.has(key)) throw new Error(`missing DB modelKey ${key}`);
}
for (const model of models) {
  if (model.type !== 'IMAGE') throw new Error(`${model.modelKey} type=${model.type}`);
  if (model.name !== 'firefly-gpt-image') throw new Error(`${model.modelKey} model=${model.name}`);
  if (model.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${model.modelKey} adapter=${model.adapter}`);
  if (String(model.provider?.providerKey || '').includes('gpt-image-2-pro')) throw new Error(`${model.modelKey} attached to GPT Image 2 Pro provider`);
  if (!String(model.provider?.providerKey || '').includes('firefly-gpt-image')) throw new Error(`${model.modelKey} provider=${model.provider?.providerKey}`);
  if (model.modelAssembly?.template !== 'firefly-gpt-image-{resolution}-{aspectRatioSlug}') throw new Error(`${model.modelKey} missing template`);
  if (!model.capabilities?.imageSizes?.includes('4K')) throw new Error(`${model.modelKey} missing 4K`);
  console.log(`[verify] ${model.modelKey} provider=${model.provider?.providerKey} model=${model.name}`);
}
const pro = await prisma.aiModel.findUnique({ where: { id: 'canvas-gpt-image-2-pro' }, include: { provider: true } });
if (!pro) throw new Error('missing canvas-gpt-image-2-pro');
if (pro.modelKey !== 'canvas-gpt-image-2-pro') throw new Error(`GPT Image 2 Pro modelKey=${pro.modelKey}`);
if (pro.adapter !== 'openai-edits') throw new Error(`GPT Image 2 Pro adapter=${pro.adapter}`);
if (pro.provider?.adapter !== 'openai-edits') throw new Error(`GPT Image 2 Pro provider adapter=${pro.provider?.adapter}`);
console.log(`[verify] ${pro.modelKey} restored provider=${pro.provider?.providerKey}`);
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
