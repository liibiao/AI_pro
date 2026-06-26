#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/canvas-preview-refresh-button-20260530030916.tar.gz}"
TARGET="${TARGET:-/var/www/ai-admin/workbench-web/image-studio-canvas-next.html}"
MIRROR="${MIRROR:-/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/canvas-preview-refresh-button-20260530030916-XXXXXX)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/www/ai-admin/backups}"
BACKUP_DIR="$BACKUP_ROOT/canvas-preview-refresh-button-20260530030916-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT
test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }

log "package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/canvas-preview-refresh-button-20260530030916/workbench-web/image-studio-canvas-next.html"
test -f "$SRC" || { echo "部署包缺少 workbench-web/image-studio-canvas-next.html" >&2; exit 1; }

log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/workbench-web" "$(dirname "$TARGET")"
run_sudo cp -a "$TARGET" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install: $TARGET"
run_sudo cp -f "$SRC" "$TARGET"

if [ -n "$MIRROR" ] && run_sudo test -d "$(dirname "$MIRROR")"; then
  log "mirror: $MIRROR"
  run_sudo cp -f "$SRC" "$MIRROR"
fi

run_sudo chown www-data:www-data "$TARGET" 2>/dev/null || true
run_sudo chmod 644 "$TARGET" 2>/dev/null || true

log "verify markers"
grep -q "PREVIEW_REFRESH_NODE_TYPES" "$TARGET"
grep -q "refreshNodePreview" "$TARGET"
grep -q "data-action=\"refreshPreview\"" "$TARGET"

log "done"
echo "backup: $BACKUP_DIR"
