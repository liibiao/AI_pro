#!/usr/bin/env bash
set -euo pipefail

PKG="api-aiyunzhi-gpt-image2-base64-restore-20260626013832"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
PUBLIC_WEB="${PUBLIC_WEB:-/var/www/ai-admin/workbench-web}"
PUBLIC_TOOLS="${PUBLIC_TOOLS:-/var/www/ai-admin/tools/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-/var/www/ai-admin/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

run_sudo(){
  "$@" && return 0
  local rc=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$rc"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$rc"
  fi
}

pm2_run(){
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR" || fail "api dir not found: $APP_DIR"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -f "$SRC/api-server/scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs" ] || fail "package missing db script"
[ -f "$SRC/payload/workbench-web/models/aiyunzhi-gpt-image-2-api.json" ] || fail "package missing model json"
grep -Fq '"response_format": "b64_json"' "$SRC/payload/workbench-web/models/aiyunzhi-gpt-image-2-api.json"
grep -Fq '"responseType": "server_base64_async_object_storage"' "$SRC/payload/workbench-web/models/aiyunzhi-gpt-image-2-api.json"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/scripts" "$BACKUP_DIR/workbench-web/models" "$BACKUP_DIR/tools/workbench-web/models"
run_sudo cp -p "$APP_DIR/scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs" "$BACKUP_DIR/scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs.prev" 2>/dev/null || true
run_sudo cp -p "$PUBLIC_WEB/models/aiyunzhi-gpt-image-2-api.json" "$BACKUP_DIR/workbench-web/models/aiyunzhi-gpt-image-2-api.json.prev" 2>/dev/null || true
run_sudo cp -p "$PUBLIC_TOOLS/models/aiyunzhi-gpt-image-2-api.json" "$BACKUP_DIR/tools/workbench-web/models/aiyunzhi-gpt-image-2-api.json.prev" 2>/dev/null || true

log "install model json and db script"
run_sudo mkdir -p "$APP_DIR/scripts" "$PUBLIC_WEB/models"
run_sudo install -m 0644 "$SRC/api-server/scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs" "$APP_DIR/scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs"
run_sudo install -m 0644 "$SRC/payload/workbench-web/models/aiyunzhi-gpt-image-2-api.json" "$PUBLIC_WEB/models/aiyunzhi-gpt-image-2-api.json"
if run_sudo test -d "$PUBLIC_TOOLS/models"; then
  run_sudo install -m 0644 "$SRC/payload/tools/workbench-web/models/aiyunzhi-gpt-image-2-api.json" "$PUBLIC_TOOLS/models/aiyunzhi-gpt-image-2-api.json"
fi

log "restore db base64 async response mode"
(cd "$APP_DIR" && node scripts/apply-aiyunzhi-gpt-image2-base64-restore.mjs)

log "verify db base64 async response mode"
(cd "$APP_DIR" && node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.aiModel.findMany({
    where: {
      type: 'IMAGE',
      OR: [
        { id: { contains: 'aiyunzhi-gpt-image-2-api', mode: 'insensitive' } },
        { modelKey: { contains: 'aiyunzhi-gpt-image-2-api', mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
  });
  const bad = rows.filter(row => {
    const protocol = row.protocol && typeof row.protocol === 'object' && !Array.isArray(row.protocol) ? row.protocol : {};
    const defaults = row.defaults && typeof row.defaults === 'object' && !Array.isArray(row.defaults) ? row.defaults : {};
    return row.adapter !== 'aiyunzhi-gpt-image-2'
      || row.name !== 'gpt-image-2'
      || protocol.responseType !== 'server_base64_async_object_storage'
      || defaults.response_format !== 'b64_json'
      || row.provider?.adapter !== 'aiyunzhi-gpt-image-2';
  });
  console.log(`[verify] rows=${rows.length} bad=${bad.length}`);
  if (!rows.length || bad.length) {
    for (const row of bad) {
      const protocol = row.protocol || {};
      const defaults = row.defaults || {};
      console.error(`[verify] bad ${row.provider?.providerKey} ${row.id}/${row.name}/${row.adapter} responseType=${protocol.responseType} response_format=${defaults.response_format}`);
    }
    process.exit(1);
  }
})().finally(() => prisma.$disconnect());
NODE
)

log "verify static model json"
grep -Fq '"response_format": "b64_json"' "$PUBLIC_WEB/models/aiyunzhi-gpt-image-2-api.json"
grep -Fq '"responseType": "server_base64_async_object_storage"' "$PUBLIC_WEB/models/aiyunzhi-gpt-image-2-api.json"

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
  pm2_run status "$PM2_APP" --no-color | sed -n '1,8p'
else
  fail "pm2 app not found: $PM2_APP"
fi

log "done"
echo "backup: $BACKUP_DIR"
