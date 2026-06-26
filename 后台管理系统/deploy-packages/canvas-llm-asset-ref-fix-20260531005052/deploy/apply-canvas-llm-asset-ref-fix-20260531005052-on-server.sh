#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/canvas-llm-asset-ref-fix-20260531005052.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/var/www/ai-admin/workbench-web}"
CANVAS_MIRROR_DIR="${CANVAS_MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/canvas-llm-asset-ref-fix-20260531005052-XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_sudo(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 0
  fi
}

trap 'rm -rf "$WORK"' EXIT
test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$APP_DIR/admin-web" || { echo "后台目录不正确: $APP_DIR" >&2; exit 1; }
run_sudo test -d "$APP_DIR/api-server" || { echo "API 目录不存在: $APP_DIR/api-server" >&2; exit 1; }

log "package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/canvas-llm-asset-ref-fix-20260531005052"

test -f "$SRC/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少画布 HTML" >&2; exit 1; }
test -f "$SRC/admin-web/src/main.tsx" || { echo "部署包缺少 admin-web/src/main.tsx" >&2; exit 1; }
test -d "$SRC/admin-web/dist" || { echo "部署包缺少 admin-web/dist" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/generation/routes.ts" || { echo "部署包缺少 generation routes source" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/generation/adapters/registry.ts" || { echo "部署包缺少 adapter registry source" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/models/routes.ts" || { echo "部署包缺少 models routes source" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/generate/routes.ts" || { echo "部署包缺少 generate routes source" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/workbench/text-agent-routes.ts" || { echo "部署包缺少 text-agent source" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/generation/routes.js" || { echo "部署包缺少 generation routes dist" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/generation/adapters/registry.js" || { echo "部署包缺少 adapter registry dist" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/models/routes.js" || { echo "部署包缺少 models routes dist" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/generate/routes.js" || { echo "部署包缺少 generate routes dist" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/workbench/text-agent-routes.js" || { echo "部署包缺少 text-agent dist" >&2; exit 1; }

BACKUP_ROOT="/var/www/ai-admin/backups/canvas-llm-asset-ref-fix-20260531005052-$STAMP"
log "backup: $BACKUP_ROOT"
run_sudo mkdir -p "$BACKUP_ROOT/workbench-web" "$BACKUP_ROOT/admin-web/src" "$BACKUP_ROOT/admin-web/dist" \
  "$BACKUP_ROOT/api-server/src/modules/generation/adapters" \
  "$BACKUP_ROOT/api-server/src/modules/models" \
  "$BACKUP_ROOT/api-server/src/modules/generate" \
  "$BACKUP_ROOT/api-server/src/modules/workbench" \
  "$BACKUP_ROOT/api-server/dist/modules/generation/adapters" \
  "$BACKUP_ROOT/api-server/dist/modules/models" \
  "$BACKUP_ROOT/api-server/dist/modules/generate" \
  "$BACKUP_ROOT/api-server/dist/modules/workbench"

run_sudo cp -a "$CANVAS_DIR/image-studio-canvas-next.html" "$BACKUP_ROOT/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_ROOT/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_ROOT/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_ROOT/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_ROOT/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_ROOT/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generate/routes.ts" "$BACKUP_ROOT/api-server/src/modules/generate/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/workbench/text-agent-routes.ts" "$BACKUP_ROOT/api-server/src/modules/workbench/text-agent-routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_ROOT/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_ROOT/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_ROOT/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generate/routes.js" "$BACKUP_ROOT/api-server/dist/modules/generate/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js" "$BACKUP_ROOT/api-server/dist/modules/workbench/text-agent-routes.js" 2>/dev/null || true

log "install canvas"
run_sudo mkdir -p "$CANVAS_DIR"
run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo chmod 0644 "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo chown www-data:www-data "$CANVAS_DIR/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$CANVAS_MIRROR_DIR" ]; then
  run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$CANVAS_MIRROR_DIR/image-studio-canvas-next.html"
  run_sudo chmod 0644 "$CANVAS_MIRROR_DIR/image-studio-canvas-next.html"
fi

log "install admin web"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist"
run_sudo cp -f "$SRC/admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist/assets"
run_sudo cp -a "$SRC/admin-web/dist/." "$APP_DIR/admin-web/dist/"

log "install api"
run_sudo mkdir -p "$APP_DIR/api-server/src/modules/generation/adapters" "$APP_DIR/api-server/src/modules/models" "$APP_DIR/api-server/src/modules/generate" "$APP_DIR/api-server/src/modules/workbench" \
  "$APP_DIR/api-server/dist/modules/generation/adapters" "$APP_DIR/api-server/dist/modules/models" "$APP_DIR/api-server/dist/modules/generate" "$APP_DIR/api-server/dist/modules/workbench"
run_sudo cp -f "$SRC/api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo cp -f "$SRC/api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo cp -f "$SRC/api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo cp -f "$SRC/api-server/src/modules/generate/routes.ts" "$APP_DIR/api-server/src/modules/generate/routes.ts"
run_sudo cp -f "$SRC/api-server/src/modules/workbench/text-agent-routes.ts" "$APP_DIR/api-server/src/modules/workbench/text-agent-routes.ts"
run_sudo cp -f "$SRC/api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo cp -f "$SRC/api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo cp -f "$SRC/api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo cp -f "$SRC/api-server/dist/modules/generate/routes.js" "$APP_DIR/api-server/dist/modules/generate/routes.js"
run_sudo cp -f "$SRC/api-server/dist/modules/workbench/text-agent-routes.js" "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"

log "restart api"
pm2_sudo restart "$PM2_APP" --update-env || pm2_sudo restart all --update-env || true
pm2_sudo save || true

log "verify markers"
run_sudo grep -q "prompt-at-popup" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo grep -q "asset-single-ref-area" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo grep -q "modern_character_design_board" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo grep -q "data-prompt-remove-ref" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo grep -q "assetDesign'||source.type==='imageToPanorama" "$CANVAS_DIR/image-studio-canvas-next.html"
run_sudo grep -q "buildLlmLabPayload" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -q "调用 JSON 入口" "$APP_DIR/admin-web/dist/assets/"*.js
run_sudo grep -q "extractChatText" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -q "type !== 'LLM'" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -q "max_tokens" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -q "LLM_MODEL_UNAVAILABLE" "$APP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -q "model.provider.endpointPath" "$APP_DIR/api-server/dist/modules/generate/routes.js"

log "done"
echo "backup: $BACKUP_ROOT"
