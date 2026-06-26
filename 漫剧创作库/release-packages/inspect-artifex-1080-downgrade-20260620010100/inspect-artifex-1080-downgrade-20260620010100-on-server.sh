#!/usr/bin/env bash
set -euo pipefail

API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"

echo "[inspect] current resolve/helper context"
for file in \
  "$API_ROOT/src/modules/generation/adapters/registry.ts" \
  "$API_ROOT/dist/modules/generation/adapters/registry.js"; do
  [[ -f "$file" ]] || continue
  echo "===== $file ====="
  grep -n "function resolveSeedance2ModelName\\|function isArtifexSeedance2ModelName\\|function isArtifexSeedance2Channel\\|video-pro-1080p\\|legacyRequestedResolution\\|requestedResolution" "$file" | sed -n '1,120p' || true
  echo "----- resolve body -----"
  awk '
    /function resolveSeedance2ModelName/ {on=1}
    on {print}
    on && /function isSeedance2FullModelName|function isArtifexSeedance2ModelName/ {exit}
  ' "$file" | sed -n '1,120p'
done

echo "[inspect] recent generation task records"
cd "$API_ROOT"
node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';

const model = await prisma.aiModel.findUnique({
  where: { id: 'canvas-seedance2-pro-720p' },
  include: { provider: true },
});
console.log('[inspect:model]', JSON.stringify({
  id: model?.id,
  modelKey: model?.modelKey,
  displayName: model?.displayName,
  name: model?.name,
  adapter: model?.adapter,
  status: model?.status,
  resolutions: model?.capabilities?.resolutions,
  modelAssembly: model?.modelAssembly,
  providerKey: model?.provider?.providerKey,
  providerDefaultModel: model?.provider?.defaultModel,
}));

const delegates = Object.keys(prisma).filter(key => /task/i.test(key) && key !== '$transaction');
console.log('[inspect:taskDelegates]', JSON.stringify(delegates));
for (const delegateName of delegates) {
  const delegate = prisma[delegateName];
  if (!delegate?.findMany) continue;
  try {
    const rows = await delegate.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    const hits = rows.filter(row => JSON.stringify(row).includes('canvas-seedance2-pro-720p') || JSON.stringify(row).includes('video-pro-1080p') || JSON.stringify(row).includes('video-pro-720p'));
    if (!hits.length) continue;
    console.log(`[inspect:${delegateName}]`);
    for (const row of hits.slice(0, 3)) {
      const compact = {};
      for (const key of ['id', 'requestId', 'modelId', 'modelKey', 'channelKey', 'status', 'type', 'mode', 'createdAt', 'updatedAt', 'params', 'requestJson', 'resultJson', 'responseJson', 'errorMessage']) {
        if (key in row) compact[key] = row[key];
      }
      console.log(JSON.stringify(compact));
    }
  } catch (err) {
    // Some delegates may not have createdAt or compatible shape.
  }
}

await prisma.$disconnect();
NODE
