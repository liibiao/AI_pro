#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aiyunzhi-admin-model-config-20260614233746"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
API_DIR="${API_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
MODELS_DIR="${CANVAS_MODELS_DIR:-/var/www/ai-admin/workbench-web/models}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-${STAMP}}"

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
run_sudo test -d "$API_DIR" || fail "api dir not found: $API_DIR"
run_sudo test -d "$MODELS_DIR" || fail "models dir not found: $MODELS_DIR"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -f "$SRC/api-server/scripts/apply-aiyunzhi-admin-model-config.mjs" ] || fail "package missing upsert script"
grep -Fq "No reusable Aiyunzhi key found" "$SRC/api-server/scripts/apply-aiyunzhi-admin-model-config.mjs"
grep -Fq "aiyunzhi-gpt-image-2" "$SRC/api-server/scripts/apply-aiyunzhi-admin-model-config.mjs"
grep -Fq "../dist/security.js" "$SRC/api-server/scripts/apply-aiyunzhi-admin-model-config.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
run_sudo cp -p "$API_DIR/scripts/apply-aiyunzhi-admin-model-config.mjs" "$BACKUP_DIR/apply-aiyunzhi-admin-model-config.mjs.prev" 2>/dev/null || true

log "install admin model config script"
run_sudo mkdir -p "$API_DIR/scripts"
run_sudo cp -p "$SRC/api-server/scripts/apply-aiyunzhi-admin-model-config.mjs" "$API_DIR/scripts/apply-aiyunzhi-admin-model-config.mjs"
run_sudo chmod 644 "$API_DIR/scripts/apply-aiyunzhi-admin-model-config.mjs"

log "apply admin model rows"
(cd "$API_DIR" && CANVAS_MODELS_DIR="$MODELS_DIR" node scripts/apply-aiyunzhi-admin-model-config.mjs)

log "verify admin model rows"
(cd "$API_DIR" && node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ids = [
  'canvas-sd2-fast',
  'canvas-sd2-full',
  'canvas-sd2',
  'canvas-aiyunzhi-sd2-preview-fast',
  'canvas-aiyunzhi-sd2-preview',
  'canvas-aiyunzhi-sd2-preview-1080p',
  'canvas-aiyunzhi-grok-1-5-video',
  'canvas-aiyunzhi-grok-3-pro-video',
  'canvas-aiyunzhi-veo-3-1',
  'canvas-aiyunzhi-veo-3-1-fast',
  'canvas-aiyunzhi-firefly-gpt-image',
  'canvas-aiyunzhi-gpt-image-2',
  'canvas-aiyunzhi-gemini-2-5-flash-image',
  'canvas-aiyunzhi-gemini-2-5-flash-image-preview',
  'canvas-aiyunzhi-gemini-3-1-flash-image',
  'canvas-aiyunzhi-gemini-3-pro-image',
];
(async () => {
  const rows = await prisma.aiModel.findMany({ where: { id: { in: ids } }, include: { provider: true } });
  const active = rows.filter(row => row.status === 'ACTIVE' && row.provider?.status === 'ACTIVE' && row.provider?.apiKeyEncrypted);
  console.log(`[verify] rows=${rows.length} activeWithKey=${active.length}`);
  if (rows.length !== ids.length || active.length !== ids.length) {
    const missing = ids.filter(id => !rows.find(row => row.id === id));
    const inactive = rows.filter(row => row.status !== 'ACTIVE' || row.provider?.status !== 'ACTIVE' || !row.provider?.apiKeyEncrypted).map(row => row.id);
    console.error('[verify] missing=' + missing.join(','));
    console.error('[verify] inactive=' + inactive.join(','));
    process.exit(1);
  }
})().finally(() => prisma.$disconnect());
NODE
)

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped, app not found: $PM2_APP"
fi

log "done"
echo "backup: $BACKUP_DIR"
