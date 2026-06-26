#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: sudo $0 /tmp/canvas-help-hard-bind-fix-YYYYMMDDHHMMSS.tar.gz" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
ROOT="/var/www/ai-admin"
WORKBENCH="$ROOT/workbench-web"
BACKUP="$ROOT/backups/canvas-help-hard-bind-fix-$STAMP"
TMP="/tmp/canvas-help-hard-bind-fix-$STAMP"

echo "==> 解包 $PKG"
rm -rf "$TMP"
mkdir -p "$TMP"
tar -xzf "$PKG" -C "$TMP"

echo "==> 备份线上文件到 $BACKUP"
mkdir -p "$BACKUP/workbench-web"
cp -a "$WORKBENCH/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html"

echo "==> 覆盖画布前端文件"
cp -a "$TMP/workbench-web/image-studio-canvas-next.html" "$WORKBENCH/image-studio-canvas-next.html"

echo "==> 校验"
grep -q 'data-settings-help' "$WORKBENCH/image-studio-canvas-next.html" && echo "settings help inline trigger patched: ok"
grep -q 'openCanvasHelpFromSettings' "$WORKBENCH/image-studio-canvas-next.html" && echo "settings help global fallback patched: ok"
grep -q 'canvasHelpPanel' "$WORKBENCH/image-studio-canvas-next.html" && echo "standalone help panel patched: ok"
grep -q 'accountMembershipVoucherCode' "$WORKBENCH/image-studio-canvas-next.html" && echo "membership voucher entry preserved: ok"

echo "部署完成。备份目录: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
