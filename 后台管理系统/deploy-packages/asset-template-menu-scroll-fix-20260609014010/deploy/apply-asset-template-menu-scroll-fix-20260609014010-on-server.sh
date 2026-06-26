#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/asset-template-menu-scroll-fix-20260609014010.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-$MIRROR_ROOT/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/asset-template-menu-scroll-fix-20260609014010-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/asset-template-menu-scroll-fix-20260609014010-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/asset-template-menu-scroll-fix-20260609014010"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
TOOLS_HTML="$SRC/tools/workbench-web/image-studio-canvas-next.html"

test -f "$HTML" || { echo "部署包缺少 workbench-web/image-studio-canvas-next.html" >&2; exit 1; }
test -f "$TOOLS_HTML" || { echo "部署包缺少 tools/workbench-web/image-studio-canvas-next.html" >&2; exit 1; }

grep -q "bindAssetTemplateScrollableMenu" "$HTML" || { echo "缺少模板菜单滚动事件围栏" >&2; exit 2; }
grep -q "canvasWheelOverlaySelector" "$HTML" || { echo "缺少画布滚轮弹窗豁免逻辑" >&2; exit 2; }
grep -q "overscroll-behavior:contain;touch-action:pan-y" "$HTML" || { echo "缺少模板菜单滚动 CSS" >&2; exit 2; }
grep -q "asset-card-template-menu" "$HTML" || { echo "缺少批量资产模板菜单样式/逻辑" >&2; exit 2; }
grep -q "three_view_face_closeup_brown" "$HTML" || { echo "缺少新增资产模板标记" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web" "$BACKUP/tools/workbench-web"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -f "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench html"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$TOOLS_HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
