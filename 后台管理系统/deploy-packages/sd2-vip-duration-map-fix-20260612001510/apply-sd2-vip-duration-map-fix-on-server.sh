#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/sd2-vip-duration-map-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/sd2-vip-duration-map-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"

REQ=(
  "api-server/src/modules/models/routes.ts"
  "api-server/dist/modules/models/routes.js"
)
for path in "${REQ[@]}"; do
  test -s "$WORKDIR/$path" || { echo "missing package file: $path" >&2; exit 1; }
done

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/api-server/src/modules/models" "$BACKUP_DIR/api-server/dist/modules/models"
cp -a "$APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/api-server/dist/modules/models/routes.js" 2>/dev/null || true

echo "[deploy] install api files"
install -m 0644 "$WORKDIR/api-server/src/modules/models/routes.ts" "$APP_ROOT/api-server/src/modules/models/routes.ts"
install -m 0644 "$WORKDIR/api-server/dist/modules/models/routes.js" "$APP_ROOT/api-server/dist/modules/models/routes.js"

echo "[deploy] repair sd-2-vip-720 duration map"
cd "$APP_ROOT/api-server"
node -r dotenv/config <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function durationList(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source
    .map(item => Number.parseInt(String(item || '').replace(/s$/i, ''), 10))
    .filter(item => Number.isFinite(item) && item > 0)
  )).sort((a, b) => a - b);
}

(async () => {
  const models = await prisma.aiModel.findMany({
    where: {
      OR: [
        { modelKey: 'sd-2-vip-720' },
        { name: 'sd-2-vip-720' },
        { displayName: { contains: 'SD 2 vip 720' } },
        { displayName: { contains: '不卡真人' } },
      ],
    },
    select: { id: true, capabilities: true },
  });
  for (const model of models) {
    const caps = model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities)
      ? { ...model.capabilities }
      : {};
    const durations = durationList(caps.durations || caps.videoDurations || caps.video_durations || caps.allowedDurations || caps.allowed_durations || caps.durationOptions || caps.duration_options);
    const resolutions = Array.isArray(caps.resolutions) && caps.resolutions.length
      ? caps.resolutions.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
      : ['720p'];
    if (!durations.length) continue;
    const map = {};
    for (const resolution of resolutions) map[resolution] = durations;
    caps.durations = durations;
    caps.videoDurations = durations;
    caps.video_durations = durations;
    caps.allowedDurations = durations;
    caps.allowed_durations = durations;
    caps.durationOptions = durations;
    caps.duration_options = durations;
    caps.durationsByResolution = map;
    caps.durations_by_resolution = map;
    await prisma.aiModel.update({ where: { id: model.id }, data: { capabilities: caps } });
    console.log(`[repair] ${model.id} durations=${durations.join(',')}`);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
NODE

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  if sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  elif pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  else
    echo "[deploy] ai-admin-api pm2 process not found; skip restart" >&2
  fi
fi

echo "[deploy] verify markers"
grep -F "durationsByResolution: undefined" "$APP_ROOT/api-server/dist/modules/models/routes.js" >/dev/null
node -r dotenv/config <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const model = await prisma.aiModel.findFirst({
    where: { modelKey: 'sd-2-vip-720' },
    select: { capabilities: true },
  });
  const caps = model && model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities) ? model.capabilities : {};
  const durations = Array.isArray(caps.durations) ? caps.durations.join(',') : '';
  const map = caps.durationsByResolution && caps.durationsByResolution['720p'];
  const mapped = Array.isArray(map) ? map.join(',') : '';
  console.log(`[verify] durations=${durations} 720p=${mapped}`);
  if (!durations || durations !== mapped) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
NODE
curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
