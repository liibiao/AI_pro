#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/refine-panorama-reference-output-fix-20260522.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/refine-panorama-reference-output-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
find "$WORKDIR" -name '._*' -print -delete || true

echo "==> 部署修图 / 全景参考图输出约束画布"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验关键标记"
grep -n "function normalizeRefineOutputValues" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "data-refine-field=\"resolution\"" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "panoRatioAuto:true" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "size:refineOutput.ratio" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：修图输出分辨率按参考图下限约束，比例锁定参考图；全景默认比例跟随参考图。"
