#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-at-reference-dedupe-fix-20260522.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/video-at-reference-dedupe-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
find "$WORKDIR" -name '._*' -print -delete || true

echo "==> 部署视频 @ 引用候选去重画布"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验关键标记"
grep -n "function vn2ImageReferenceKeys" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "keys.some(key=>seen.has(key))" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：视频节点 @ 引用内容已按完整图片引用身份去重。"
