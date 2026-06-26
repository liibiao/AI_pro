#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/toolbar-toggle-remove-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/toolbar-toggle-remove-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验左侧工具栏按钮已移除"
! grep -n "toolbarToggleBtn\\|toolbar-toggle\\|bindCanvasToolbarExpand\\|CANVAS_TOOLBAR_EXPANDED" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "assetLibraryBtn" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head
grep -n "toolbar:hover .tb-tool:first-child" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：左侧工具栏展开/收起按钮已移除，保留 hover 自动展开。"
