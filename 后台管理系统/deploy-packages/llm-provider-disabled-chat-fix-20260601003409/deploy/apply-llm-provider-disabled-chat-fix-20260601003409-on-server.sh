#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/llm-provider-disabled-chat-fix-20260601003409.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/llm-provider-disabled-chat-fix-20260601003409-XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$APP_DIR/api-server" || { echo "API 目录不存在: $APP_DIR/api-server" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/llm-provider-disabled-chat-fix-20260601003409"

for f in \
  api-server/src/upstream.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/src/modules/workbench/text-agent-routes.ts \
  api-server/dist/upstream.js \
  api-server/dist/modules/generation/routes.js \
  api-server/dist/modules/workbench/text-agent-routes.js
do
  test -f "$SRC/$f" || { echo "部署包缺少 $f" >&2; exit 1; }
done

BACKUP_ROOT="/var/www/ai-admin/backups/llm-provider-disabled-chat-fix-20260601003409-$STAMP"
log "backup: $BACKUP_ROOT"
run_sudo mkdir -p \
  "$BACKUP_ROOT/api-server/src/modules/generation" \
  "$BACKUP_ROOT/api-server/src/modules/workbench" \
  "$BACKUP_ROOT/api-server/dist/modules/generation" \
  "$BACKUP_ROOT/api-server/dist/modules/workbench"

for f in \
  api-server/src/upstream.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/src/modules/workbench/text-agent-routes.ts \
  api-server/dist/upstream.js \
  api-server/dist/modules/generation/routes.js \
  api-server/dist/modules/workbench/text-agent-routes.js
do
  run_sudo cp -a "$APP_DIR/$f" "$BACKUP_ROOT/$f" 2>/dev/null || true
  run_sudo mkdir -p "$(dirname "$APP_DIR/$f")"
  run_sudo cp -f "$SRC/$f" "$APP_DIR/$f"
done

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify markers"
run_sudo grep -q "provider.type !== 'LLM'" "$APP_DIR/api-server/dist/upstream.js"
run_sudo grep -q "type !== 'LLM'" "$APP_DIR/api-server/dist/modules/generation/routes.js"
if run_sudo grep -q "provider: { status: 'ACTIVE' }" "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"; then
  echo "文本 Agent 仍要求 provider ACTIVE，部署未生效" >&2
  exit 1
fi
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_ROOT"
