#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-pricing-help-config-sync-fix-20260522.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/gpt-image-pricing-help-config-sync-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
find "$WORKDIR" -name '._*' -print -delete || true

echo "==> 部署画布积分帮助表配置同步修复"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验 GPT-Image-2-pro 帮助表按后台配置优先"
grep -n "const gptImage2ProFallback" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "tiers.length?tiers:fallbackRows" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：GPT-Image-2-pro 积分帮助表会优先显示后台定价配置。"
