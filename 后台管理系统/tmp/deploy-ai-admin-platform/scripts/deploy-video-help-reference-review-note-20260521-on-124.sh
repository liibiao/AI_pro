#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-help-reference-review-note-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/video-help-reference-review-note-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布帮助表说明"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验关键标记"
grep -n "videoHumanReviewText" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "真人审核友好" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "真人审核按渠道常规风控" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"

echo "部署完成：积分计费表的视频计费说明已增加参考素材支持与真人审核情况。"
