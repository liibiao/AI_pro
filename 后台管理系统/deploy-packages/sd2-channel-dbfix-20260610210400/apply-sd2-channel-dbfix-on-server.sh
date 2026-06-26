#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
ROOT="/var/www/ai-admin"
API="$ROOT/ai-admin-platform/api-server"
TMP="/tmp/sd2-channel-dbfix-$$"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="$ROOT/backups/sd2-channel-dbfix-20260610210400-$STAMP"

echo "[deploy] extract $ARCHIVE"
rm -rf "$TMP"
mkdir -p "$TMP" "$BACKUP"
tar -xzf "$ARCHIVE" -C "$TMP"

echo "[deploy] backup: $BACKUP"
mkdir -p "$BACKUP/api-server/src" "$BACKUP/api-server/dist"
cp -p "$API/src/consolidate-sd2-models.ts" "$BACKUP/api-server/src/consolidate-sd2-models.ts" 2>/dev/null || true
cp -p "$API/dist/consolidate-sd2-models.js" "$BACKUP/api-server/dist/consolidate-sd2-models.js" 2>/dev/null || true

echo "[deploy] install consolidate script"
install -m 0644 "$TMP/api-server/src/consolidate-sd2-models.ts" "$API/src/consolidate-sd2-models.ts"
install -m 0644 "$TMP/api-server/dist/consolidate-sd2-models.js" "$API/dist/consolidate-sd2-models.js"

echo "[deploy] run SD2 consolidation db fix"
cd "$API"
node dist/consolidate-sd2-models.js

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  PM2_HOME="${PM2_HOME:-/home/ubuntu/.pm2}" pm2 restart ai-admin-api --update-env
  PM2_HOME="${PM2_HOME:-/home/ubuntu/.pm2}" pm2 save || true
fi

echo "[deploy] verify db rows"
node -e 'import("./dist/db.js").then(async ({prisma})=>{const expected={ "canvas-sd2-fast":["sd2-fast","second"], "canvas-sd2-full":["sd2-full","second"], "canvas-sd2":["seedance-2","generation"] }; const rows=await prisma.aiModel.findMany({where:{id:{in:Object.keys(expected)}},orderBy:{id:"asc"}}); for (const row of rows) console.log(`${row.id} | ${row.displayName} | ${row.name} | ${row.unit} | ${JSON.stringify(row.modelAssembly)}`); for (const row of rows){const exp=expected[row.id]; if(!exp || row.name!==exp[0] || row.unit!==exp[1]) throw new Error(`bad row ${row.id}`);} await prisma.$disconnect();})'

echo "[deploy] done"
echo "backup: $BACKUP"
