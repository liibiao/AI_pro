#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-preview-click-fence-fix-20260522.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/video-preview-click-fence-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
find "$WORKDIR" -name '._*' -print -delete || true

echo "==> 覆盖画布 HTML"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验视频预览点击隔离标记"
grep -n "bindNodeVideoPreviewEventFence" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "videoPreviewSurfaceFenceBound" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "isNodeVideoPreviewSurfaceHit" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：视频生成节点/视频查看节点预览区点击已隔离，不再透传打开参考图。"
