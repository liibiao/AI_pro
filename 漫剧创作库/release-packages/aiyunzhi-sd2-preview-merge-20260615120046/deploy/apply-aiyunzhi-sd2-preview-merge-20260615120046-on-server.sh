#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="aiyunzhi-sd2-preview-merge-20260615120046"
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

copy_model_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/aiyunzhi-sd2-preview.json" "$web_dir/models/aiyunzhi-sd2-preview.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "$web_dir/model-registry.json"
  rm -f "$web_dir/models/aiyunzhi-sd2-preview-1080p.json"
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api" "$BACKUP_DIR/public" "$BACKUP_DIR/repo"

if [[ -d "$PUBLIC_WEB" ]]; then
  cp -a "$PUBLIC_WEB/model-registry.json" "$BACKUP_DIR/public/model-registry.json" 2>/dev/null || true
  cp -a "$PUBLIC_WEB/models/aiyunzhi-sd2-preview.json" "$BACKUP_DIR/public/aiyunzhi-sd2-preview.json" 2>/dev/null || true
  cp -a "$PUBLIC_WEB/models/aiyunzhi-sd2-preview-1080p.json" "$BACKUP_DIR/public/aiyunzhi-sd2-preview-1080p.json" 2>/dev/null || true
fi
cp -a "${API_ROOT}/src/billing.ts" "$BACKUP_DIR/api/billing.ts"
cp -a "${API_ROOT}/dist/billing.js" "$BACKUP_DIR/api/billing.js"
cp -a "${API_ROOT}/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api/registry.ts"
cp -a "${API_ROOT}/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api/registry.js"

echo "[deploy] install static workbench model config"
copy_model_bundle "$PUBLIC_WEB"
copy_model_bundle "${REPO_ROOT}/tools/workbench-web"
copy_model_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
copy_model_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi
if [[ -d "${REPO_ROOT}/tools" ]]; then
  cp -a "${WORK_DIR}/${PKG_NAME}/tools/image_studio_backend.py" "${REPO_ROOT}/tools/image_studio_backend.py"
fi
if [[ -d "${REPO_ROOT}/smart-vision/services/workbench" ]]; then
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/services/workbench/image_studio_backend.py" "${REPO_ROOT}/smart-vision/services/workbench/image_studio_backend.py"
fi
if [[ -d "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools" ]]; then
  cp -a "${WORK_DIR}/${PKG_NAME}/tools/image_studio_backend.py" "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/image_studio_backend.py"
fi

echo "[deploy] install admin scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-aiyunzhi-sd2-preview-merge-code.mjs" \
  "${API_ROOT}/scripts/patch-aiyunzhi-sd2-preview-merge-code.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-aiyunzhi-sd2-preview-merge.mjs" \
  "${API_ROOT}/scripts/apply-aiyunzhi-sd2-preview-merge.mjs"

echo "[deploy] patch admin api routing and billing"
(cd "$API_ROOT" && node scripts/patch-aiyunzhi-sd2-preview-merge-code.mjs)

echo "[deploy] apply admin model merge"
(cd "$API_ROOT" && node scripts/apply-aiyunzhi-sd2-preview-merge.mjs)

echo "[deploy] verify static config"
node - <<'NODE'
const fs = require('fs');
const model = JSON.parse(fs.readFileSync('/var/www/ai-admin/workbench-web/models/aiyunzhi-sd2-preview.json', 'utf8'));
if (model.name !== 'sd2-preview') throw new Error(`unexpected model name ${model.name}`);
if (model.modelAssembly?.template !== 'sd2-{resolution}-preview') throw new Error('missing preview template');
if (!model.capabilities?.resolutions?.includes('720p') || !model.capabilities?.resolutions?.includes('1080p')) throw new Error('merged resolutions missing');
if (fs.existsSync('/var/www/ai-admin/workbench-web/models/aiyunzhi-sd2-preview-1080p.json')) throw new Error('old 1080p json still exists');
console.log('[verify] static merged model ok');
NODE

echo "[deploy] verify admin code"
(cd "$API_ROOT" && node - <<'NODE'
const fs = require('fs');
const checks = [
  ['src/billing.ts', 'videoFlatPriceForInput(model, input)', 'resolutionTiers'],
  ['dist/billing.js', 'videoFlatPriceForInput(model, input)', 'resolutionTiers'],
  ['src/modules/generation/adapters/registry.ts', 'sd2-${requestedResolution}-preview', 'sd2-preview'],
  ['dist/modules/generation/adapters/registry.js', 'sd2-${requestedResolution}-preview', 'sd2-preview'],
];
for (const [file, a, b] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(a) || !text.includes(b)) throw new Error(`${file} missing merge patch`);
}
console.log('[verify] admin routing/billing patch ok');
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
