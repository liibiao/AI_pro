#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/prompt-reference-upload-ui-fix-20260609095534.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-$MIRROR_ROOT/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/prompt-reference-upload-ui-fix-20260609095534-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/prompt-reference-upload-ui-fix-20260609095534-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/prompt-reference-upload-ui-fix-20260609095534"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
TOOLS_HTML="$SRC/tools/workbench-web/image-studio-canvas-next.html"

test -f "$HTML" || { echo "部署包缺少 workbench-web/image-studio-canvas-next.html" >&2; exit 1; }
test -f "$TOOLS_HTML" || { echo "部署包缺少 tools/workbench-web/image-studio-canvas-next.html" >&2; exit 1; }

grep -q "makePromptImageImportEntry" "$HTML" || { echo "缺少轻量图片参考导入逻辑" >&2; exit 2; }
grep -q "fillPromptImageEntrySize" "$HTML" || { echo "缺少图片尺寸异步读取逻辑" >&2; exit 2; }
grep -q "等待后台上传" "$HTML" || { echo "缺少后台上传状态标记" >&2; exit 2; }
grep -q "makePromptImageImportEntry(file,'prompt-import')" "$HTML" || { echo "文本节点图片参考仍未使用轻量入口" >&2; exit 2; }
grep -q "makePromptImageImportEntry(file,'asset-design-reference')" "$HTML" || { echo "资产设计图片参考仍未使用轻量入口" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web" "$BACKUP/tools/workbench-web"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -f "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench html"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$TOOLS_HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
