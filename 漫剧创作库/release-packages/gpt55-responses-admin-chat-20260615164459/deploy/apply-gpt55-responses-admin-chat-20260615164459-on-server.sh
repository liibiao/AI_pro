#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt55-responses-admin-chat-20260615164459"
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
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
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

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_DIR" || fail "api dir not found: $API_DIR"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -f "$SRC/api-server/scripts/apply-gpt55-responses-admin-chat.mjs" ] || fail "package missing admin patch script"
grep -Fq "function isResponsesLlmChannel" "$SRC/api-server/scripts/apply-gpt55-responses-admin-chat.mjs"
grep -Fq "buildResponsesLlmRequestPayload" "$SRC/api-server/scripts/apply-gpt55-responses-admin-chat.mjs"
grep -Fq "findReusableCliproxyKey" "$SRC/api-server/scripts/apply-gpt55-responses-admin-chat.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
run_sudo cp -p "$API_DIR/dist/modules/generate/routes.js" "$BACKUP_DIR/routes.js.prev" 2>/dev/null || true
run_sudo cp -p "$API_DIR/scripts/apply-gpt55-responses-admin-chat.mjs" "$BACKUP_DIR/apply-gpt55-responses-admin-chat.mjs.prev" 2>/dev/null || true

log "install admin patch script"
run_sudo mkdir -p "$API_DIR/scripts"
run_sudo cp -p "$SRC/api-server/scripts/apply-gpt55-responses-admin-chat.mjs" "$API_DIR/scripts/apply-gpt55-responses-admin-chat.mjs"
run_sudo chmod 644 "$API_DIR/scripts/apply-gpt55-responses-admin-chat.mjs"

log "patch admin chat route and upsert model row"
(cd "$API_DIR" && CANVAS_MODELS_DIR="$MODELS_DIR" node scripts/apply-gpt55-responses-admin-chat.mjs)

log "verify patched admin route"
grep -Fq "z.any()" "$API_DIR/dist/modules/generate/routes.js"
grep -Fq "function isResponsesLlmChannel" "$API_DIR/dist/modules/generate/routes.js"
grep -Fq "buildResponsesLlmRequestPayload" "$API_DIR/dist/modules/generate/routes.js"
grep -Fq "type: 'input_image'" "$API_DIR/dist/modules/generate/routes.js"
grep -Fq "extractResponsesText" "$API_DIR/dist/modules/generate/routes.js"

log "verify admin model row"
(cd "$API_DIR" && node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const row = await prisma.aiModel.findUnique({
    where: { id: 'canvas-gpt-5-5-responses-llm' },
    include: { provider: true },
  });
  if (!row || row.status !== 'ACTIVE' || row.type !== 'LLM' || row.adapter !== 'openai-responses' || row.endpointPath !== '/responses') {
    console.error('[verify] missing or invalid GPT-5.5 Responses row');
    process.exit(1);
  }
  if (!row.provider || row.provider.status !== 'ACTIVE' || row.provider.adapter !== 'openai-responses' || row.provider.baseUrl !== 'http://45.77.211.38:8317/v1' || !row.provider.apiKeyEncrypted) {
    console.error('[verify] missing or invalid GPT-5.5 Responses provider');
    process.exit(1);
  }
  console.log(`[verify] ${row.id} ${row.type} ${row.adapter} ${row.endpointPath} ${row.provider.providerKey}`);
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
