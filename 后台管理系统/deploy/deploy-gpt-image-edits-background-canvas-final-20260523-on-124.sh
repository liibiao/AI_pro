#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-edits-background-canvas-final-124-20260523.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

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

log "检查包和目录"
test -f "$PKG" || { echo "包不存在: $PKG" >&2; exit 1; }
test -d "$BACKEND_DIR/api-server" || { echo "后台目录不正确: $BACKEND_DIR" >&2; exit 1; }
test -d "$CANVAS_DIR/tools/workbench-web" || { echo "画布目录不正确: $CANVAS_DIR" >&2; exit 1; }

WORKDIR="$(mktemp -d /tmp/gpt-image-edits-background-canvas-124-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"

log "覆盖后台 edits 参数清理逻辑"
if test -d "$WORKDIR/api-server"; then
  cp -R "$WORKDIR/api-server/." "$BACKEND_DIR/api-server/"
fi

log "覆盖画布 HTML"
cp -f "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
if test -d "$ONLINE_WORKBENCH_DIR"; then
  mkdir -p "$ONLINE_WORKBENCH_DIR"
  cp -f "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
fi

log "编译后台"
cd "$BACKEND_DIR/api-server"
if command -v npm >/dev/null 2>&1; then
  npm run build
else
  node node_modules/typescript/bin/tsc -p tsconfig.json
fi

log "重启后台 PM2"
pm2_as_user restart "$PM2_APP" --update-env || pm2_as_user restart all --update-env || true
pm2_as_user save || true

log "校验关键标记"
grep -n "sanitizeOpenAiImageRequestForEndpoint" "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js" | head -5 || true
grep -n "isEditLikeMode" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html" | head -5
if test -f "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"; then
  grep -n "isEditLikeMode" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head -5
fi
log "部署完成"
