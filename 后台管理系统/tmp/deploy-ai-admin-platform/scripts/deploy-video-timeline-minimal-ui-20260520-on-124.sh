#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-timeline-minimal-ui-20260520.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
WORK_DIR="/tmp/video-timeline-minimal-ui-20260520-$(date +%Y%m%d%H%M%S)"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR"
mkdir -p "$ONLINE_WORKBENCH_DIR"
mkdir -p "$WORK_DIR"

echo "==> 解压补丁包"
tar -xzf "$PKG" -C "$WORK_DIR"

echo "==> 部署画布源码"
rsync -a "$WORK_DIR/漫剧创作库/" "$CANVAS_DIR/"

echo "==> 覆盖线上 workbench HTML"
cp "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验极简时间轴 UI"
grep -n "width:min(calc(100vw - 96px),calc(100% + 320px))" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "vfi-panel::before{display:none}" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "vfi-action\\[data-tip\\]" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "data-vfi-capture.*data-tip=\"截取当前帧\"" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "data-vfi-split.*data-tip=\"分割视频\"" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：视频节点内嵌时间轴已去掉大块半透明背景，并改为外扩完整显示。"
