#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-pricing-help-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 canvas-pricing-help-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/canvas-pricing-help-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-pricing-help-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/workbench-web"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖画布客户端"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"

echo "==> 校验"
grep -q 'pricingHelpRowsHtml' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas pricing help table patched: ok"
grep -q '这里只显示后台已启用的渠道和模型' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "enabled model pricing notice patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
