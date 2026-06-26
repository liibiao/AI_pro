#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="sd2-pro-highquality-1080-target-fix-20260619233528"
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

backup_file() {
  local target="$1"
  local backup="$2"
  if [[ -f "$target" ]]; then
    mkdir -p "$(dirname "$backup")"
    cp -a "$target" "$backup"
  fi
}

backup_web_file() {
  local web_dir="$1"
  local rel="$2"
  backup_file "$web_dir/$rel" "$BACKUP_DIR/web/${web_dir//\//_}/$rel"
}

copy_static_restore_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models"
  for rel in \
    "models/sora-video-pro.json" \
    "models/seedance2-pro.json" \
    "model-registry.json"; do
    backup_web_file "$web_dir" "$rel"
    mkdir -p "$(dirname "$web_dir/$rel")"
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/${rel}" "$web_dir/$rel"
  done
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts" "$BACKUP_DIR/web"

echo "[deploy] restore static non-target model configs"
copy_static_restore_bundle "$PUBLIC_WEB"
copy_static_restore_bundle "${REPO_ROOT}/tools/workbench-web"
copy_static_restore_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
copy_static_restore_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  backup_file "${REPO_ROOT}/smart-vision/config/model-registry.json" "${BACKUP_DIR}/web/smart-vision-config-model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/config/model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi

echo "[deploy] install and apply db fix"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-sd2-pro-highquality-1080-target-fix.mjs" \
  "${API_ROOT}/scripts/apply-sd2-pro-highquality-1080-target-fix.mjs"
(cd "$API_ROOT" && node scripts/apply-sd2-pro-highquality-1080-target-fix.mjs)

echo "[deploy] verify static restore"
node - <<'NODE'
const fs = require('fs');
const sora = JSON.parse(fs.readFileSync('/var/www/ai-admin/workbench-web/models/sora-video-pro.json', 'utf8'));
if (sora.model !== 'video-pro-720p') throw new Error(`sora static model=${sora.model}`);
if (sora.modelAssembly?.type !== 'passthrough') throw new Error(`sora assembly=${JSON.stringify(sora.modelAssembly)}`);
if (JSON.stringify(sora.capabilities?.resolutions || []) !== JSON.stringify(['720p'])) throw new Error('sora static resolutions mismatch');
const pro = JSON.parse(fs.readFileSync('/var/www/ai-admin/workbench-web/models/seedance2-pro.json', 'utf8'));
if (!Array.isArray(pro.capabilities?.resolutions) || pro.capabilities.resolutions.includes('1080p')) throw new Error('plain seedance2-pro static should not include 1080p');
const registry = fs.readFileSync('/var/www/ai-admin/workbench-web/model-registry.json', 'utf8');
if (!registry.includes('"identityKey": "artifex::video-pro-720p"')) throw new Error('registry should restore sora video-pro-720p');
console.log('[verify] static restore ok');
NODE

echo "[deploy] verify db target and disabled wrong models"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const target = await prisma.aiModel.findUnique({
  where: { id: 'canvas-seedance2-pro-720p' },
  include: { provider: true },
});
if (!target) throw new Error('missing target');
if (target.displayName !== 'SD2.0 Pro 高质量 不卡真人') throw new Error(`target display=${target.displayName}`);
if (target.status !== 'ACTIVE') throw new Error(`target status=${target.status}`);
if (target.name !== 'video-pro') throw new Error(`target name=${target.name}`);
if (target.adapter !== 'seedance2') throw new Error(`target adapter=${target.adapter}`);
if (target.modelAssembly?.template !== 'video-pro-{resolution}') throw new Error(`target template=${target.modelAssembly?.template}`);
for (const resolution of ['480p', '720p', '1080p']) {
  if (!target.capabilities?.resolutions?.includes(resolution)) throw new Error(`target missing ${resolution}`);
}
const tiers = target.defaults?.pricing?.resolutionTiers || [];
if (!tiers.some(item => item.resolution === '1080p')) throw new Error('target missing 1080p pricing');
if (!target.provider || target.provider.status !== 'ACTIVE') throw new Error('target provider not active');
const wrong = await prisma.aiModel.findMany({
  where: { id: { in: ['canvas-sora-video-pro', 'canvas-seedance2-pro'] } },
  select: { id: true, status: true },
});
for (const model of wrong) {
  if (model.status !== 'DISABLED') throw new Error(`${model.id} status=${model.status}`);
}
console.log(`[verify] target ok id=${target.id} provider=${target.provider.providerKey} resolutions=${JSON.stringify(target.capabilities.resolutions)}`);
console.log(`[verify] wrong disabled ${JSON.stringify(wrong)}`);
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
