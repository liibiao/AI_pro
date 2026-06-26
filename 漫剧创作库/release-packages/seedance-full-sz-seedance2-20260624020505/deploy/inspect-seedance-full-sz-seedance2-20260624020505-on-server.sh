#!/usr/bin/env bash
set -euo pipefail

API_SERVER="${API_SERVER:-/var/www/ai-admin/ai-admin-platform/api-server}"

echo "[inspect] files"
grep -F '"model": "sz-seedance2"' /var/www/ai-admin/workbench-web/models/sz-seedance2.json
grep -F '"1080p": "sz-seedance2-1080p"' /var/www/ai-admin/workbench-web/models/sz-seedance2.json
grep -F "'seedance-full': { submit: submitSeedanceFullVideo" "$API_SERVER/dist/modules/generation/adapters/registry.js"
grep -F "SEEDANCE_FULL_SZ_SEEDANCE2_ADAPTER" "$API_SERVER/dist/modules/generation/adapters/registry.js"

echo "[inspect] database"
cd "$API_SERVER"
node --input-type=module <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';

const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { modelKey: { in: ['sz-seedance2', 'sd2-internal-dreamina-mini', 'sd2-internal-transit9-fast', 'sd2-internal-transit9-2-0'] } },
      { id: { in: ['canvas-sz-seedance2'] } },
    ],
  },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
for (const model of models) {
  console.log(JSON.stringify({
    id: model.id,
    modelKey: model.modelKey,
    adapter: model.adapter,
    providerId: model.providerId,
    providerKey: model.provider?.providerKey,
    providerAdapter: model.provider?.adapter,
    endpointPath: model.endpointPath,
    status: model.status,
  }));
}
const providers = await prisma.upstreamProvider.findMany({
  where: { id: { in: ['canvas-provider-seedance-full', 'canvas-provider-sd2-internal'] } },
  orderBy: { id: 'asc' },
});
for (const provider of providers) {
  console.log(JSON.stringify({
    providerId: provider.id,
    providerKey: provider.providerKey,
    adapter: provider.adapter,
    endpointPath: provider.endpointPath,
    defaultModel: provider.defaultModel,
    status: provider.status,
  }));
}
await prisma.$disconnect();
NODE

echo "[inspect] processes"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
fi
ps -eo pid,ppid,user,comm,args | grep -Ei 'ai-admin|api-server|workbench|node|pm2' | grep -v grep || true
