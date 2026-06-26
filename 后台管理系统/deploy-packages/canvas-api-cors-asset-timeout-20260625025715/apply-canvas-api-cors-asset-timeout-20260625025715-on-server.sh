#!/usr/bin/env bash
set -euo pipefail

PKG_NAME="canvas-api-cors-asset-timeout-20260625025715"
PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t "/tmp/${PKG_NAME}.tar.gz" /tmp/canvas-api-cors-asset-timeout-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 canvas-api-cors-asset-timeout-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
CANVAS_REPO_ROOT="${CANVAS_REPO_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG_NAME}-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

require_marker() {
  local marker="$1"
  local file="$2"
  if ! grep -Fq "$marker" "$file"; then
    echo "缺少部署标记：$marker ($file)" >&2
    exit 1
  fi
}

validate_api_app() {
  local file="$1"
  require_marker "isLocalCanvasOrigin" "$file"
  require_marker "127.0.0.1" "$file"
  require_marker "[::1]" "$file"
}

validate_text_agent() {
  local file="$1"
  require_marker "maxTimeoutMs = 900000" "$file"
}

validate_canvas_html() {
  local file="$1"
  require_marker "function formatApiTimeoutMs" "$file"
  require_marker "requestTimedOut=true" "$file"
  require_marker "const ASSET_CARD_DERIVE_CHAT_TIMEOUT_MS=900000" "$file"
}

tar -xzf "$PKG" -C "$WORKDIR"

validate_api_app "$WORKDIR/api-server/src/app.ts"
validate_api_app "$WORKDIR/api-server/dist/app.js"
validate_text_agent "$WORKDIR/api-server/src/modules/workbench/text-agent-routes.ts"
validate_text_agent "$WORKDIR/api-server/dist/modules/workbench/text-agent-routes.js"
validate_canvas_html "$WORKDIR/workbench-web/image-studio-canvas-next.html"
validate_canvas_html "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"

mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/workbench" \
  "$BACKUP_DIR/api-server/dist/modules/workbench" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web" \
  "$APP_ROOT/api-server/src/modules/workbench" \
  "$APP_ROOT/api-server/dist/modules/workbench" \
  "$REMOTE_ROOT/workbench-web" \
  "$CANVAS_REPO_ROOT/tools/workbench-web"

cp -a "$APP_ROOT/api-server/src/app.ts" "$BACKUP_DIR/api-server/src/app.ts"
cp -a "$APP_ROOT/api-server/dist/app.js" "$BACKUP_DIR/api-server/dist/app.js"
cp -a "$APP_ROOT/api-server/src/modules/workbench/text-agent-routes.ts" \
  "$BACKUP_DIR/api-server/src/modules/workbench/text-agent-routes.ts"
cp -a "$APP_ROOT/api-server/dist/modules/workbench/text-agent-routes.js" \
  "$BACKUP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"
cp -a "$REMOTE_ROOT/workbench-web/image-studio-canvas-next.html" \
  "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" \
  "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

cp -a "$WORKDIR/api-server/src/app.ts" "$APP_ROOT/api-server/src/app.ts"
cp -a "$WORKDIR/api-server/dist/app.js" "$APP_ROOT/api-server/dist/app.js"
cp -a "$WORKDIR/api-server/src/modules/workbench/text-agent-routes.ts" \
  "$APP_ROOT/api-server/src/modules/workbench/text-agent-routes.ts"
cp -a "$WORKDIR/api-server/dist/modules/workbench/text-agent-routes.js" \
  "$APP_ROOT/api-server/dist/modules/workbench/text-agent-routes.js"
install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" \
  "$REMOTE_ROOT/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"

validate_api_app "$APP_ROOT/api-server/src/app.ts"
validate_api_app "$APP_ROOT/api-server/dist/app.js"
validate_text_agent "$APP_ROOT/api-server/src/modules/workbench/text-agent-routes.ts"
validate_text_agent "$APP_ROOT/api-server/dist/modules/workbench/text-agent-routes.js"
validate_canvas_html "$REMOTE_ROOT/workbench-web/image-studio-canvas-next.html"
validate_canvas_html "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health
echo
curl -fsS -D "$WORKDIR/cors.headers" -o /dev/null -X OPTIONS \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization,x-generation-timeout-ms' \
  http://127.0.0.1:4000/api/workbench/text-agent/run
grep -Fq 'Access-Control-Allow-Origin: http://127.0.0.1:5173' "$WORKDIR/cors.headers"
grep -Fq 'Access-Control-Allow-Headers: content-type,authorization,x-generation-timeout-ms' "$WORKDIR/cors.headers"

echo "部署完成，备份目录：$BACKUP_DIR"
