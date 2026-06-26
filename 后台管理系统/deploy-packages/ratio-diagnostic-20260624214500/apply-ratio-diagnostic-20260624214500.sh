#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/var/www/ai-admin/ai-admin-platform"

echo "[diag] frontend markers"
for file in \
  "$APP_ROOT/workbench-web/image-studio-canvas-next.html" \
  "$APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"; do
  if [[ -f "$file" ]]; then
    echo "file=$file"
    grep -n "normalizeNodeImageSizeForActiveModel" "$file" | head -3 || true
    grep -n "requestedPixelSize:apiSize" "$file" | head -3 || true
  else
    echo "missing=$file"
  fi
done

echo "[diag] backend markers"
REG="$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
if [[ -f "$REG" ]]; then
  grep -n "function resolveAiyunzhiFireflyModelName" "$REG" | head -2 || true
  grep -n "requested_size" "$REG" | head -2 || true
else
  echo "missing=$REG"
fi

echo "[diag] recent image generation tasks"
cd "$APP_ROOT/api-server"
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function pick(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj && obj[key] != null ? obj[key] : undefined;
  return out;
}
(async () => {
  const rows = await prisma.generationTask.findMany({
    where: { type: 'IMAGE' },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true,
      createdAt: true,
      status: true,
      modelId: true,
      channelKey: true,
      prompt: true,
      paramsJson: true,
      requestJson: true,
      errorMessage: true,
    },
  });
  for (const row of rows) {
    const params = row.paramsJson || {};
    const request = row.requestJson || {};
    console.log(JSON.stringify({
      id: row.id,
      createdAt: row.createdAt,
      status: row.status,
      modelId: row.modelId,
      channelKey: row.channelKey,
      prompt: String(row.prompt || '').slice(0, 80),
      params: pick(params, ['model','modelNick','size','resolution','requestedResolution','imageSize','aspectRatio','aspect_ratio','requestedRatio','requestedPixelSize','response_format','responseType','response_type']),
      protocol: pick(params.protocol || {}, ['adapter','requestSchema','responseType','response_type','modelNameMode','model_name_mode']),
      request: pick(request, ['model','size','n','response_format','aspect_ratio','requested_size']),
      errorMessage: row.errorMessage ? String(row.errorMessage).slice(0, 180) : '',
    }));
  }
})().finally(() => prisma.$disconnect());
NODE
