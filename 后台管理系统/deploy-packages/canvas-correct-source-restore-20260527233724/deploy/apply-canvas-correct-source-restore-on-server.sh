#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then echo "用法: bash $0 /tmp/canvas-correct-source-restore-YYYYMMDDHHMMSS.tar.gz" >&2; exit 1; fi
STAMP="$(date +%Y%m%d%H%M%S)"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
BACKUP="${BACKUP:-/var/www/ai-admin/backups/canvas-correct-source-restore-$STAMP}"
TMP="/tmp/canvas-correct-source-restore-$STAMP"
rm -rf "$TMP"; mkdir -p "$TMP" "$BACKUP/online" "$BACKUP/canvas"
tar --no-same-owner -xzf "$PKG" -C "$TMP"
test -f "$TMP/workbench-web/image-studio-canvas-next.html"
mkdir -p "$ONLINE_WORKBENCH_DIR"
cp -a "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/online/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$CANVAS_DIR/image-studio-canvas-next.html" "$BACKUP/canvas/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$TMP/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
if [[ -d "$CANVAS_DIR" ]]; then install -m 0644 "$TMP/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/image-studio-canvas-next.html"; fi
grep -n '<title>智能视界</title>' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
if grep -q 'TapNow 风格节点工作流' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"; then echo '错误：旧标题仍存在' >&2; exit 2; fi
if grep -q 'personal-api-tokens' "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"; then echo '警告：页面仍含 personal-api-tokens，请确认是否符合预期' >&2; fi
echo "部署完成。备份目录: $BACKUP"
echo "验证地址: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
