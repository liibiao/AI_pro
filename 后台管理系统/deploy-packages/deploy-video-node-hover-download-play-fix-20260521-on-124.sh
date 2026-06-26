#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-node-hover-download-play-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/video-node-hover-download-play-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验关键标记"
grep -n "updateVideoDownloadProgressDom" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "isVideoNativeControlHit" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "topbar:hover .tb-btn" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "toolbar:hover" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head
grep -n "node-tools:hover" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：视频节点下载/播放/工具栏 hover 展开修复已更新。"
