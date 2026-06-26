#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then echo "用法: sudo bash $0 /tmp/canvas-audio-upload-fix-YYYYMMDDHHMMSS.tar.gz" >&2; exit 1; fi
STAMP="$(date +%Y%m%d%H%M%S)"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
BACKUP="${BACKUP:-/var/www/ai-admin/backups/canvas-audio-upload-fix-$STAMP}"
TMP="/tmp/canvas-audio-upload-fix-$STAMP"
rm -rf "$TMP"; mkdir -p "$TMP" "$BACKUP"
tar --no-same-owner -xzf "$PKG" -C "$TMP"
test -f "$TMP/workbench-web/image-studio-canvas-next.html"
test -d "$TMP/workbench-web/canvas-next"
mkdir -p "$ONLINE_WORKBENCH_DIR"
cp -a "$ONLINE_WORKBENCH_DIR" "$BACKUP/online-workbench-web" 2>/dev/null || true
[[ -d "$CANVAS_DIR" ]] && cp -a "$CANVAS_DIR" "$BACKUP/canvas-workbench-web" 2>/dev/null || true
rsync -a --delete "$TMP/workbench-web/" "$ONLINE_WORKBENCH_DIR/"
[[ -d "$CANVAS_DIR" ]] && rsync -a --delete "$TMP/workbench-web/" "$CANVAS_DIR/"
grep -n '<title>智能视界</title>' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "sourceFile=entry.file" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "enumerable:true" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
test -f "$ONLINE_WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"
test -f "$ONLINE_WORKBENCH_DIR/workbench-engine.js"
echo "部署完成。备份目录: $BACKUP"
echo "强刷地址: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
