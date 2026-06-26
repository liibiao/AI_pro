#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: sudo $0 /tmp/membership-plan-yuan-price-fix-YYYYMMDDHHMMSS.tar.gz" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
ROOT="/var/www/ai-admin"
APP="$ROOT/ai-admin-platform"
BACKUP="$ROOT/backups/membership-plan-yuan-price-fix-$STAMP"
TMP="/tmp/membership-plan-yuan-price-fix-$STAMP"

echo "==> 解包 $PKG"
rm -rf "$TMP"
mkdir -p "$TMP"
tar -xzf "$PKG" -C "$TMP"

echo "==> 备份线上文件到 $BACKUP"
mkdir -p "$BACKUP/ai-admin-platform/admin-web/src" "$BACKUP/ai-admin-platform/admin-web/dist"
cp -a "$APP/admin-web/src/main.tsx" "$BACKUP/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$APP/admin-web/dist/." "$BACKUP/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

echo "==> 覆盖后台管理前端"
cp -a "$TMP/ai-admin-platform/admin-web/src/main.tsx" "$APP/admin-web/src/main.tsx"
cp -a "$TMP/ai-admin-platform/admin-web/dist/." "$APP/admin-web/dist/"

echo "==> 校验"
grep -q '价格（元）' "$APP/admin-web/src/main.tsx" && echo "membership plan yuan label patched: ok"
grep -q 'normalizePlanSubmitValues' "$APP/admin-web/src/main.tsx" && echo "membership plan yuan submit conversion patched: ok"
grep -Rqs '价格（元）' "$APP/admin-web/dist" "$APP/admin-web/src/main.tsx" && echo "admin dist yuan price ui patched: ok"

echo "部署完成。备份目录: $BACKUP"
echo "后台强制刷新: http://124.156.137.236/?v=$STAMP"
