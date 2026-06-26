#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/panorama-ratio-prompt-restore-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/panorama-ratio-prompt-restore-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验全景比例/提示词/查看器修复标记"
grep -n "getPanoramaRatioOptionsForAdapter" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "panorama strip" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "普通单点透视超宽风景图" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "verifiedPanorama=nd.type==='imageToPanorama'?true" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "allowUnknownSize:true" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head

echo "部署完成：全景节点已恢复多比例生成，取消 2:1 阻断，并加强环绕空间提示词。"
