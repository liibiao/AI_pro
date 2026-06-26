#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-route-adapter-binding-fix-20260619205835"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
REPO_ROOT="/home/ubuntu/漫剧创作库"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts"

echo "[deploy] install admin api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-route-priority.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-route-priority.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/repair-fullblood-adapter-binding.mjs" \
  "${API_ROOT}/scripts/repair-fullblood-adapter-binding.mjs"

echo "[deploy] patch fullblood route priority"
(cd "$API_ROOT" && node scripts/patch-fullblood-route-priority.mjs)

echo "[deploy] repair fullblood provider/model binding"
(cd "$API_ROOT" && node scripts/repair-fullblood-adapter-binding.mjs)

echo "[deploy] verify route markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('FULLBLOOD_ROUTE_PRIORITY_GUARD')) throw new Error(`${file} missing fullblood priority guard`);
  if (!text.includes("return 'fullblood-video'")) throw new Error(`${file} missing fullblood route return`);
  const fullbloodIndex = text.indexOf("return 'fullblood-video'");
  const seedanceIndex = text.indexOf("return 'seedance2'");
  const soraIndex = text.indexOf("return 'sora-video-pro'");
  if (seedanceIndex >= 0 && fullbloodIndex > seedanceIndex) throw new Error(`${file} fullblood guard after seedance`);
  if (soraIndex >= 0 && fullbloodIndex > soraIndex) throw new Error(`${file} fullblood guard after sora`);
}
console.log('[verify] route priority ok');
NODE

echo "[deploy] verify admin db binding"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2'] } },
      { modelKey: { in: ['fullblood-seedance-2', 'fullblood-omni-video-2', 'canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2'] } },
    ],
  },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
if (models.length < 2) throw new Error(`expected at least 2 fullblood models, found ${models.length}`);
for (const model of models) {
  if (model.type !== 'VIDEO') throw new Error(`${model.id} type=${model.type}`);
  if (model.adapter !== 'fullblood-video') throw new Error(`${model.id} adapter=${model.adapter}`);
  if (model.endpointPath !== '/videos') throw new Error(`${model.id} endpointPath=${model.endpointPath}`);
  if (model.statusEndpointPath !== '/videos/{taskId}') throw new Error(`${model.id} statusEndpointPath=${model.statusEndpointPath}`);
  if (model.protocol?.adapter !== 'fullblood-video') throw new Error(`${model.id} protocol adapter=${model.protocol?.adapter}`);
  if (model.provider?.providerKey !== 'canvas_fullblood-video') throw new Error(`${model.id} provider=${model.provider?.providerKey}`);
  if (model.provider?.adapter !== 'fullblood-video') throw new Error(`${model.id} provider adapter=${model.provider?.adapter}`);
  if (!model.provider?.apiKeyEncrypted) throw new Error(`${model.id} provider missing key`);
  console.log(`[verify] ${model.id} real=${model.name} modelAdapter=${model.adapter} providerAdapter=${model.provider.adapter}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
