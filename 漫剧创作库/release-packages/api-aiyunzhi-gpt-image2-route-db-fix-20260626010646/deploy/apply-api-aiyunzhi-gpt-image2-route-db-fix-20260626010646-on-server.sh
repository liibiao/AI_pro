#!/usr/bin/env bash
set -euo pipefail

PKG="api-aiyunzhi-gpt-image2-route-db-fix-20260626010646"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
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
[ -f "$SRC/payload/src/modules/generation/routes.ts" ] || fail "package missing src routes"
[ -f "$SRC/payload/dist/modules/generation/routes.js" ] || fail "package missing dist routes"
[ -f "$SRC/api-server/scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs" ] || fail "package missing db fix script"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/src/modules/generation" "$BACKUP_DIR/dist/modules/generation" "$BACKUP_DIR/scripts"
run_sudo cp -p "$APP_DIR/src/modules/generation/routes.ts" "$BACKUP_DIR/src/modules/generation/routes.ts"
run_sudo cp -p "$APP_DIR/dist/modules/generation/routes.js" "$BACKUP_DIR/dist/modules/generation/routes.js"
run_sudo cp -p "$APP_DIR/scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs" "$BACKUP_DIR/scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs.prev" 2>/dev/null || true

log "install routes and db repair script"
run_sudo install -m 0644 "$SRC/payload/src/modules/generation/routes.ts" "$APP_DIR/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$SRC/payload/dist/modules/generation/routes.js" "$APP_DIR/dist/modules/generation/routes.js"
run_sudo mkdir -p "$APP_DIR/scripts"
run_sudo install -m 0644 "$SRC/api-server/scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs" "$APP_DIR/scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs"

log "verify route markers"
grep -Fq "isAiyunzhiGptImage2Hint" "$APP_DIR/src/modules/generation/routes.ts"
grep -Fq "return /gpt[-_ ]?image[-_ ]?2/.test(text)" "$APP_DIR/src/modules/generation/routes.ts"
grep -Fq "gpt-image-2 low-price" "$APP_DIR/src/modules/generation/routes.ts"
if grep -Fq "return text.includes('canvas_aiyunzhi-gpt-image-2-api')" "$APP_DIR/src/modules/generation/routes.ts"; then
  fail "stale canvas_aiyunzhi legacy route rule is still present"
fi
node --check "$APP_DIR/dist/modules/generation/routes.js" >/dev/null

log "repair Aiyunzhi GPT Image 2 API model rows"
(cd "$APP_DIR" && node scripts/apply-aiyunzhi-gpt-image2-route-db-fix.mjs)

log "verify repaired db rows"
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
  const bad = rows.filter(row => row.adapter !== 'aiyunzhi-gpt-image-2' || row.name !== 'gpt-image-2' || row.endpointPath !== '/v1/images/generations' || row.provider?.adapter !== 'aiyunzhi-gpt-image-2');
  console.log(`[verify] rows=${rows.length} bad=${bad.length}`);
  if (!rows.length || bad.length) {
    for (const row of bad) console.error(`[verify] bad ${row.provider?.providerKey} ${row.id}/${row.name}/${row.adapter}/${row.endpointPath}`);
    process.exit(1);
  }
})().finally(() => prisma.$disconnect());
NODE
)

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
