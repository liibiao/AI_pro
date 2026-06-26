#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="text-agent-script-timeout-chat-ui-20260622101022"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

TEXT_AGENT_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/workbench/text-agent-routes.ts"
TEXT_AGENT_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/workbench/text-agent-routes.js"
GENERATE_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generate/routes.ts"
GENERATE_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generate/routes.js"
HTML_PUBLIC_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
HTML_TOOLS_SRC="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"

[ -f "$TEXT_AGENT_SRC" ] || fail "package missing text-agent-routes.ts"
[ -f "$TEXT_AGENT_DIST" ] || fail "package missing text-agent-routes.js"
[ -f "$GENERATE_SRC" ] || fail "package missing generate/routes.ts"
[ -f "$GENERATE_DIST" ] || fail "package missing generate/routes.js"
[ -f "$HTML_PUBLIC_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_TOOLS_SRC" ] || fail "package missing tools/workbench-web/image-studio-canvas-next.html"

log "verify package markers"
grep -Fq "resolveTextAgentTimeoutMs" "$TEXT_AGENT_SRC"
grep -Fq "taskInstruction: z.string().default" "$TEXT_AGENT_SRC"
grep -Fq "硬性约束：必须严格围绕" "$TEXT_AGENT_DIST"
grep -Fq "resolveGenerateChatTimeoutMs" "$GENERATE_SRC"
grep -Fq "sanitizeGenerateChatExtra" "$GENERATE_DIST"
grep -Fq "剧本 Agent" "$HTML_PUBLIC_SRC"
grep -Fq "prompt-chat-thread" "$HTML_PUBLIC_SRC"
grep -Fq "animateTextPromptChatResult" "$HTML_PUBLIC_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generate" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generate" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror/tools/workbench-web"
run_sudo cp -a "$APP_DIR/api-server/src/modules/workbench/text-agent-routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench/text-agent-routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench/text-agent-routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generate/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generate/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generate/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generate/routes.js" 2>/dev/null || true
run_sudo cp -a "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install api and canvas files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/workbench" \
  "$APP_DIR/api-server/dist/modules/workbench" \
  "$APP_DIR/api-server/src/modules/generate" \
  "$APP_DIR/api-server/dist/modules/generate" \
  "$WEB_ROOT/workbench-web"
run_sudo install -m 0644 "$TEXT_AGENT_SRC" "$APP_DIR/api-server/src/modules/workbench/text-agent-routes.ts"
run_sudo install -m 0644 "$TEXT_AGENT_DIST" "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"
run_sudo install -m 0644 "$GENERATE_SRC" "$APP_DIR/api-server/src/modules/generate/routes.ts"
run_sudo install -m 0644 "$GENERATE_DIST" "$APP_DIR/api-server/dist/modules/generate/routes.js"
run_sudo install -m 0644 "$HTML_PUBLIC_SRC" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  run_sudo install -m 0644 "$HTML_TOOLS_SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "resolveTextAgentTimeoutMs" "$APP_DIR/api-server/src/modules/workbench/text-agent-routes.ts"
run_sudo grep -Fq "硬性约束：必须严格围绕" "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "resolveGenerateChatTimeoutMs" "$APP_DIR/api-server/src/modules/generate/routes.ts"
run_sudo grep -Fq "sanitizeGenerateChatExtra" "$APP_DIR/api-server/dist/modules/generate/routes.js"
run_sudo grep -Fq "剧本 Agent" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "prompt-chat-thread" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
