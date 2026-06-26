#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
ROOT="/var/www/ai-admin"
API="$ROOT/ai-admin-platform/api-server"
TMP="/tmp/seedance2-prompt-fix-$$"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="$ROOT/backups/seedance2-prompt-fix-20260611004000-$STAMP"

echo "[deploy] extract $ARCHIVE"
rm -rf "$TMP"
mkdir -p "$TMP" "$BACKUP/api-server/src/modules/generation/adapters" "$BACKUP/api-server/dist/modules/generation/adapters"
tar -xzf "$ARCHIVE" -C "$TMP"

echo "[deploy] backup: $BACKUP"
cp -p "$API/src/modules/generation/adapters/registry.ts" "$BACKUP/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -p "$API/dist/modules/generation/adapters/registry.js" "$BACKUP/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

echo "[deploy] install generation adapter"
install -m 0644 "$TMP/api-server/src/modules/generation/adapters/registry.ts" "$API/src/modules/generation/adapters/registry.ts"
install -m 0644 "$TMP/api-server/dist/modules/generation/adapters/registry.js" "$API/dist/modules/generation/adapters/registry.js"

echo "[deploy] verify prompt/content marker"
grep -F "prompt: ctx.prompt" "$API/dist/modules/generation/adapters/registry.js" >/dev/null
grep -F "...(content.length > 1 ? { content } : {})" "$API/dist/modules/generation/adapters/registry.js" >/dev/null

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  PM2_HOME="${PM2_HOME:-/home/ubuntu/.pm2}" pm2 restart ai-admin-api --update-env
  PM2_HOME="${PM2_HOME:-/home/ubuntu/.pm2}" pm2 save || true
fi

echo "[deploy] verify SD2 db rows"
cd "$API"
node -e 'import("./dist/db.js").then(async ({prisma})=>{const rows=await prisma.aiModel.findMany({where:{id:{in:["canvas-sd2-fast","canvas-sd2-full","canvas-sd2"]}},include:{provider:true},orderBy:{id:"asc"}}); for(const r of rows) console.log([r.id,r.displayName,r.name,r.endpointPath,r.statusEndpointPath,JSON.stringify(r.capabilities),JSON.stringify(r.modelAssembly),r.unit].join(" | ")); await prisma.$disconnect();})'

echo "[deploy] done"
echo "backup: $BACKUP"
