#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/canvas-video-run-button-unblock-20260531214712.tar.gz}"
TARGET="${TARGET:-/var/www/ai-admin/workbench-web}"
MIRROR="${MIRROR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/canvas-video-run-button-unblock-20260531214712-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/canvas-video-run-button-unblock-20260531214712-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$TARGET" || { echo "线上画布目录不存在: $TARGET" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/canvas-video-run-button-unblock-20260531214712/workbench-web/image-studio-canvas-next.html"
test -f "$SRC" || { echo "部署包缺少 workbench-web/image-studio-canvas-next.html" >&2; exit 1; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web"
run_sudo cp -a "$TARGET/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$SRC" "$TARGET/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR")" ]; then
  run_sudo mkdir -p "$MIRROR"
  run_sudo cp -f "$SRC" "$MIRROR/image-studio-canvas-next.html" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$TARGET/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$TARGET/image-studio-canvas-next.html" 2>/dev/null || true

log "verify markers"
run_sudo grep -q "normalizeSyncedImageState" "$TARGET/image-studio-canvas-next.html"
run_sudo grep -q "referenceStillNeedsUploadForNode" "$TARGET/image-studio-canvas-next.html"
run_sudo grep -q "vn2-go\\[data-action=\\\"runNode\\\"\\]" "$TARGET/image-studio-canvas-next.html"
run_sudo grep -q "runNode(id,{manual:true})" "$TARGET/image-studio-canvas-next.html"

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
