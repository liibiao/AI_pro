#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/seedance-fast-pro-help-note-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/seedance-fast-pro-help-note-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布帮助表"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验关键标记"
grep -n "支持 4图 + 1视频，0音频" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "不支持真人" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"

echo "部署完成：seedance2.0-fast/pro 帮助表说明已修正。"
