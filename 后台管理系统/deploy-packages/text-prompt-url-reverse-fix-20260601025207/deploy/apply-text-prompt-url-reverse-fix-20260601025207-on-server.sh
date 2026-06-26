#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/text-prompt-url-reverse-fix-20260601025207.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
WORKBENCH_SERVER="${WORKBENCH_SERVER:-/home/ubuntu/漫剧创作库/tools/workbench_server.py}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/text-prompt-url-reverse-fix-20260601025207-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/text-prompt-url-reverse-fix-20260601025207-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/text-prompt-url-reverse-fix-20260601025207"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
SERVER="$SRC/tools/workbench_server.py"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -f "$SERVER" || { echo "部署包缺少 workbench_server.py" >&2; exit 1; }

log "verify package markers"
grep -q "textPromptTaskInstruction" "$HTML"
grep -q "data-prompt-action=\"extractUrl\"" "$HTML"
grep -q "/api/workbench/url/extract" "$HTML"
grep -q "def extract_url_content" "$SERVER"
grep -q "/api/workbench/url/extract" "$SERVER"

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web" "$BACKUP/tools"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_SERVER" "$BACKUP/tools/workbench_server.py" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install workbench server"
if [ -d "$(dirname "$WORKBENCH_SERVER")" ]; then
  run_sudo cp -f "$SERVER" "$WORKBENCH_SERVER"
else
  log "skip workbench server install, parent missing: $(dirname "$WORKBENCH_SERVER")"
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 755 "$WORKBENCH_SERVER" 2>/dev/null || true

log "verify installed markers"
run_sudo grep -q "textPromptTaskInstruction" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "data-prompt-action=\"extractUrl\"" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "/api/workbench/url/extract" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if run_sudo test -f "$WORKBENCH_SERVER"; then
  run_sudo grep -q "def extract_url_content" "$WORKBENCH_SERVER"
  run_sudo grep -q "/api/workbench/url/extract" "$WORKBENCH_SERVER"
fi

log "restart services if available"
run_sudo systemctl restart studio-workbench 2>/dev/null || true
run_sudo systemctl restart ai-admin 2>/dev/null || true
run_sudo systemctl reload nginx 2>/dev/null || true

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
