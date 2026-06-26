#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt2-lowcost-response-type-async-fix-20260624153706"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then sudo "$@"; else return "$status"; fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_NAME" >/dev/null 2>&1; then
    pm2 "$@"
  elif [ "${DEPLOY_USE_SUDO:-auto}" != "never" ] && command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

verify_markers(){
  grep -Fq "server_async_object_storage', label: '124 异步转存 COS" "$1"
  grep -Fq "return 'server_async_object_storage'" "$2"
  grep -Fq "UPSTREAM_IMAGE_URL_UNAVAILABLE" "$3"
  grep -Fq "server_base64_async_object_storage" "$4"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/ai-admin-platform"

for file in \
  "$SRC/api-server/src/modules/generation/adapters/registry.ts" \
  "$SRC/api-server/dist/modules/generation/adapters/registry.js" \
  "$SRC/api-server/src/modules/generation/routes.ts" \
  "$SRC/api-server/dist/modules/generation/routes.js" \
  "$SRC/api-server/src/modules/models/routes.ts" \
  "$SRC/api-server/dist/modules/models/routes.js" \
  "$SRC/admin-web/src/main.tsx"
do
  [ -f "$file" ] || fail "missing package file: $file"
done
[ -d "$SRC/admin-web/dist" ] || fail "missing admin-web dist"

log "verify package markers"
verify_markers "$SRC/admin-web/src/main.tsx" "$SRC/api-server/src/modules/models/routes.ts" "$SRC/api-server/src/modules/generation/adapters/registry.ts" "$SRC/api-server/src/modules/generation/routes.ts"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install api files"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/src/modules/models" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/models"
run_sudo cp -a "$SRC/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
run_sudo cp -a "$SRC/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo cp -a "$SRC/api-server/src/modules/generation/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo cp -a "$SRC/api-server/dist/modules/generation/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo cp -a "$SRC/api-server/src/modules/models/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo cp -a "$SRC/api-server/dist/modules/models/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"

if [ -f "$REMOTE_APP_ROOT/api-server/node_modules/typescript/bin/tsc" ]; then
  log "compile api"
  ( cd "$REMOTE_APP_ROOT/api-server" && node node_modules/typescript/bin/tsc -p tsconfig.json )
fi

log "install admin-web files"
run_sudo cp -a "$SRC/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$SRC/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "fix existing GPT Image 2 response_type config"
( cd "$REMOTE_APP_ROOT/api-server" && node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
function isRecord(value){ return value && typeof value === 'object' && !Array.isArray(value); }
function normalizeOne(value){
  const raw = String(value || '').trim().toLowerCase();
  if (['server_object_storage','server-object-storage','backend_object_storage','backend-object-storage','backend_cos','server_cos','124_cos','124-server-cos','124服务器转存cos','后台转存cos'].includes(raw)) return 'server_async_object_storage';
  return value;
}
function patchJson(value){
  const next = isRecord(value) ? { ...value } : {};
  next.responseType = normalizeOne(next.responseType);
  next.response_type = normalizeOne(next.response_type);
  if (next.responseType === 'server_async_object_storage') next.response_type = 'server_async_object_storage';
  if (next.response_type === 'server_async_object_storage') next.responseType = 'server_async_object_storage';
  return next;
}
const rows = await prisma.aiModel.findMany({
  where: {
    type: 'IMAGE',
    OR: [
      { adapter: 'aiyunzhi-gpt-image-2' },
      { modelKey: { contains: 'gpt-image-2' } },
      { name: { contains: 'gpt-image-2' } },
      { displayName: { contains: 'GPT 2' } },
    ],
  },
  select: { id: true, adapter: true, modelKey: true, name: true, displayName: true, protocol: true, defaults: true },
});
let changed = 0;
for (const row of rows) {
  const text = `${row.adapter || ''} ${row.modelKey || ''} ${row.name || ''} ${row.displayName || ''}`.toLowerCase();
  if (!/aiyunzhi-gpt-image-2|gpt[-_ ]?image[-_ ]?2|gpt 2/.test(text)) continue;
  const protocol = patchJson(row.protocol);
  const defaults = patchJson(row.defaults);
  const before = JSON.stringify({ protocol: row.protocol || {}, defaults: row.defaults || {} });
  const after = JSON.stringify({ protocol, defaults });
  if (before === after) continue;
  await prisma.aiModel.update({ where: { id: row.id }, data: { protocol, defaults } });
  changed += 1;
  console.log(`[config-fix] ${row.id}: responseType=server_async_object_storage`);
}
console.log(`[config-fix] updated=${changed}`);
await prisma.$disconnect();
NODE
)

log "verify installed markers"
verify_markers "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"

log "restart api"
if pm2_run restart "$PM2_NAME" --update-env; then
  pm2_run save || true
else
  log "pm2 restart skipped; please restart $PM2_NAME manually"
fi

log "done. backup=$BACKUP_DIR"
