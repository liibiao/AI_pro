#!/usr/bin/env bash
set -euo pipefail
PKG="/tmp/video-node-fail-retry-fix-202605280916.tar.gz"
WORK="/tmp/video-node-fail-retry-fix-202605280916"
TARGET="/var/www/ai-admin/workbench-web"
MIRROR="/home/ubuntu/漫剧创作库/tools/workbench-web"
BACKUP="/var/www/ai-admin/backups/workbench-web-video-node-fail-retry-fix-202605280916-$(date +%Y%m%d%H%M%S)"
if [ ! -f "$PKG" ]; then echo "缺少部署包：$PKG" >&2; exit 1; fi
rm -rf "$WORK"
mkdir -p "$WORK"
tar -xzf "$PKG" -C "$WORK"
if [ ! -d "$WORK/video-node-fail-retry-fix-202605280916/workbench-web" ]; then echo "部署包结构错误" >&2; exit 1; fi
mkdir -p "$(dirname "$TARGET")" /var/www/ai-admin/backups
if [ -d "$TARGET" ]; then cp -a "$TARGET" "$BACKUP"; fi
rm -rf "$TARGET"
cp -a "$WORK/video-node-fail-retry-fix-202605280916/workbench-web" "$TARGET"
if [ -d "$(dirname "$MIRROR")" ]; then rm -rf "$MIRROR"; cp -a "$TARGET" "$MIRROR"; fi
chown -R www-data:www-data "$TARGET" 2>/dev/null || true
find "$TARGET" -type d -exec chmod 755 {} \; 2>/dev/null || true
find "$TARGET" -type f -exec chmod 644 {} \; 2>/dev/null || true
echo "OK deployed: $TARGET"
echo "backup: $BACKUP"
