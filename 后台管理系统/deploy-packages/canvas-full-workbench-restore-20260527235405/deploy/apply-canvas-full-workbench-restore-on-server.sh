#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then echo "用法: sudo bash $0 /tmp/canvas-full-workbench-restore-YYYYMMDDHHMMSS.tar.gz" >&2; exit 1; fi
STAMP="$(date +%Y%m%d%H%M%S)"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
BACKUP="${BACKUP:-/var/www/ai-admin/backups/canvas-full-workbench-restore-$STAMP}"
TMP="/tmp/canvas-full-workbench-restore-$STAMP"
rm -rf "$TMP"; mkdir -p "$TMP" "$BACKUP"
tar --no-same-owner -xzf "$PKG" -C "$TMP"
test -f "$TMP/workbench-web/image-studio-canvas-next.html"
test -d "$TMP/workbench-web/canvas-next"
mkdir -p "$ONLINE_WORKBENCH_DIR"
if [[ -d "$ONLINE_WORKBENCH_DIR" ]]; then cp -a "$ONLINE_WORKBENCH_DIR" "$BACKUP/online-workbench-web" 2>/dev/null || true; fi
if [[ -d "$CANVAS_DIR" ]]; then cp -a "$CANVAS_DIR" "$BACKUP/canvas-workbench-web" 2>/dev/null || true; fi
rsync -a --delete "$TMP/workbench-web/" "$ONLINE_WORKBENCH_DIR/"
if [[ -d "$CANVAS_DIR" ]]; then rsync -a --delete "$TMP/workbench-web/" "$CANVAS_DIR/"; fi
grep -n '<title>智能视界</title>' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
test -f "$ONLINE_WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"
test -f "$ONLINE_WORKBENCH_DIR/workbench-engine.js"
if grep -q 'TapNow 风格节点工作流' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"; then echo '错误：旧标题仍存在' >&2; exit 2; fi
echo "部署完成。备份目录: $BACKUP"
echo "强刷地址: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
