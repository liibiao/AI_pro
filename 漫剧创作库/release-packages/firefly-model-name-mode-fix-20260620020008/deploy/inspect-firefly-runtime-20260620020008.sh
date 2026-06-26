#!/usr/bin/env bash
set -euo pipefail

API_ROOT="${API_ROOT:-/var/www/ai-admin/ai-admin-platform/api-server}"

echo "[inspect] api root: $API_ROOT"
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const files = [
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
];
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`[inspect] missing ${file}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  console.log(`\n[inspect] ${file}`);
  for (const needle of ['aiyunzhi-firefly-gpt-image', 'firefly-gpt-image', 'resolveAiyunzhiFireflyDirectModel', 'AIYUNZHI_FIREFLY_DIRECT_CHAT_ADAPTER', 'modelAssembly', 'aspectRatioSlug']) {
    const idx = text.indexOf(needle);
    console.log(`  ${needle}: ${idx}`);
    if (idx >= 0) {
      const start = Math.max(0, idx - 700);
      const end = Math.min(text.length, idx + 1800);
      console.log(text.slice(start, end).split('\n').slice(0, 80).join('\n'));
    }
  }
}
NODE

(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { modelKey: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
      { adapter: 'aiyunzhi-firefly-gpt-image' },
      { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
    ],
  },
  include: { provider: true },
  orderBy: { createdAt: 'asc' },
});
for (const m of models) {
  console.log(JSON.stringify({
    id: m.id,
    modelKey: m.modelKey,
    name: m.name,
    displayName: m.displayName,
    adapter: m.adapter,
    endpointPath: m.endpointPath,
    providerKey: m.provider?.providerKey,
    providerAdapter: m.provider?.adapter,
    providerBaseUrl: m.provider?.baseUrl,
    providerEndpointPath: m.provider?.endpointPath,
    providerDefaultModel: m.provider?.defaultModel,
    protocol: m.protocol,
    modelAssembly: m.modelAssembly,
  }, null, 2));
}
await prisma.$disconnect();
NODE
)
