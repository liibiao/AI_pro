#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/canvas-text-asset-node-fix-20260529163830.tar.gz}"
WORKBENCH_TARGET="${WORKBENCH_TARGET:-/var/www/ai-admin/workbench-web}"
WORKBENCH_MIRROR="${WORKBENCH_MIRROR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/canvas-text-asset-node-fix-20260529163830-XXXXXX)"
BACKUP_ROOT="/var/www/ai-admin/backups/canvas-text-asset-node-fix-20260529163830-$STAMP"

log(){ printf '==> %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_TARGET" || { echo "工作台目录不存在: $WORKBENCH_TARGET" >&2; exit 1; }

tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/canvas-text-asset-node-fix-20260529163830"
test -f "$SRC/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }

log "备份线上画布到 $BACKUP_ROOT"
run_sudo mkdir -p "$BACKUP_ROOT/workbench-web" /var/www/ai-admin/backups
run_sudo cp -a "$WORKBENCH_TARGET/image-studio-canvas-next.html" "$BACKUP_ROOT/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "部署文本提示词 / 资产设计节点修复"
run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
if run_sudo test -d "$(dirname "$WORKBENCH_MIRROR")"; then
  run_sudo mkdir -p "$WORKBENCH_MIRROR"
  run_sudo cp -f "$WORKBENCH_TARGET/image-studio-canvas-next.html" "$WORKBENCH_MIRROR/image-studio-canvas-next.html"
fi

run_sudo chown www-data:www-data "$WORKBENCH_TARGET/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_TARGET/image-studio-canvas-next.html" 2>/dev/null || true

log "文件标记校验"
grep -q "textPrompt:{cat:'input',name:'文本提示词'" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "assetDesign:{cat:'generate',name:'资产设计'" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "prompt-node-bar" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "renderLlmModelOptionsForNode" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "runLlmPromptNode" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "资产设计节点" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "文本提示词节点" "$WORKBENCH_TARGET/image-studio-canvas-next.html"

log "部署完成"
echo "backup: $BACKUP_ROOT"
echo "url: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
