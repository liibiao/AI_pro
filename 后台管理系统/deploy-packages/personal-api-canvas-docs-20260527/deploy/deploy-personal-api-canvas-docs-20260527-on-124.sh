#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log(){ printf '==> %s\n' "$*"; }
pm2_as_user(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" pm2 "$@"
  else
    pm2 "$@"
  fi
}

log "检查目录"
test -d "$BACKEND_DIR/api-server" || { echo "后台目录不正确: $BACKEND_DIR" >&2; exit 1; }
mkdir -p "$BACKEND_DIR/docs"

log "覆盖 API Server 源码与 Prisma"
cp -R "$PKG_ROOT/api-server/src/." "$BACKEND_DIR/api-server/src/"
cp -R "$PKG_ROOT/api-server/prisma/." "$BACKEND_DIR/api-server/prisma/"
cp -f "$PKG_ROOT/api-server/package.json" "$PKG_ROOT/api-server/package-lock.json" "$PKG_ROOT/api-server/tsconfig.json" "$BACKEND_DIR/api-server/"

log "覆盖个人 API 文档"
cp -f "$PKG_ROOT/docs/customer-generation-api.md" "$BACKEND_DIR/docs/customer-generation-api.md"
cp -f "$PKG_ROOT/docs/customer-generation-api.html" "$BACKEND_DIR/docs/customer-generation-api.html"

log "覆盖画布 HTML"
if test -d "$CANVAS_DIR/tools/workbench-web"; then
  cp -f "$PKG_ROOT/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
fi
mkdir -p "$ONLINE_WORKBENCH_DIR"
cp -f "$PKG_ROOT/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

log "安装依赖并编译后台"
cd "$BACKEND_DIR/api-server"
if command -v npm >/dev/null 2>&1; then
  npm install
  npm run prisma:generate
  npm run build
else
  node node_modules/typescript/bin/tsc -p tsconfig.json
fi

log "重启后台 PM2"
pm2_as_user restart "$PM2_APP" --update-env || pm2_as_user restart all --update-env || true
pm2_as_user save || true

log "校验关键内容"
grep -n "personal-api-tokens" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head -5
grep -n "个人 API 接入" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head -5
grep -n "请求体参数表" "$BACKEND_DIR/docs/customer-generation-api.html" | head -5
log "部署完成"
