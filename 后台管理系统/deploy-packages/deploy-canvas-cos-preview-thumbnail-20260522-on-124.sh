#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/canvas-cos-preview-thumbnail-20260522.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

if [[ ! -f "$PKG" ]]; then
  echo "包不存在: $PKG" >&2
  exit 1
fi

echo "==> 检查画布目录"
if [[ ! -d "$CANVAS_DIR/tools/workbench-web" ]]; then
  echo "画布源码目录不存在: $CANVAS_DIR/tools/workbench-web" >&2
  exit 1
fi

WORK="/tmp/canvas-cos-preview-thumbnail-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
tar -xzf "$PKG" -C "$WORK"

SRC="$WORK/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$SRC" ]]; then
  echo "包内缺少 image-studio-canvas-next.html" >&2
  exit 1
fi

echo "==> 部署画布源码"
cp "$SRC" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"

if [[ -d "$ONLINE_WORKBENCH_DIR" ]]; then
  echo "==> 覆盖线上 workbench HTML"
  cp "$SRC" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
else
  echo "==> 未找到线上 workbench 目录，跳过: $ONLINE_WORKBENCH_DIR"
fi

echo "==> 校验 COS 缩略图预览标记"
grep -n "function cosPreviewThumbUrl" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "data-cos-thumb" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
if [[ -d "$ONLINE_WORKBENCH_DIR" ]]; then
  grep -n "function cosPreviewThumbUrl" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
fi

echo "部署完成：COS 原图 URL 保留，画布/资产库预览自动使用 COS 缩略图。"
