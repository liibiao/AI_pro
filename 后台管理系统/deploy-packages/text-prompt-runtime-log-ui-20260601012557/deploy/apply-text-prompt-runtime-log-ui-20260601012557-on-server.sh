#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/text-prompt-runtime-log-ui-20260601012557.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/text-prompt-runtime-log-ui-20260601012557-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/text-prompt-runtime-log-ui-20260601012557-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/text-prompt-runtime-log-ui-20260601012557"
test -f "$SRC/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi
run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "verify markers"
run_sudo grep -q "prompt-run-status" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "prompt-runtime-feed" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "TEXT_PROMPT_RUNTIME_STEPS" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "renderTextPromptOutputContent" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "文本 Agent 路由不可用，切换为 LLM 直连" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
