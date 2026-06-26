#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-native-control-hit-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/video-native-control-hit-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验视频播放按钮命中修复"
grep -n "function isVideoNativeControlHit" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "controlBand=Math.min(220" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "playZoneW=Math.min(180" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 兼容校验：只保留顶部和左侧工具栏 hover 展开"
grep -n "topbar:hover .tb-btn" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "toolbar:hover" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head
if grep -n "node-tools:hover" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"; then
  echo "ERROR: 仍存在节点工具栏 hover 展开规则" >&2
  exit 1
fi

echo "部署完成：视频节点原生播放按钮不再触发查看大图。"
