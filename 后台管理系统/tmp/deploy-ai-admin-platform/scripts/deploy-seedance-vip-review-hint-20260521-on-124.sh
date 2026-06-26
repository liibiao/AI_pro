#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/seedance-vip-review-hint-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/seedance-vip-review-hint-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布提示语与 Seedance 模型说明"
mkdir -p "$CANVAS_DIR/tools/workbench-web/models" "$ONLINE_WORKBENCH_DIR/models"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$ONLINE_WORKBENCH_DIR/models/seedance2-vip.json"

echo "==> 校验关键标记"
grep -n "真人审核友好" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "对真人审核友好" "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"

echo "部署完成：Seedance 2.0 VIP 提示语已增加真人审核友好信息。"
