#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/director-stage-workbench-ui-20260601173958.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/director-stage-workbench-ui-20260601173958-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/director-stage-workbench-ui-20260601173958-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/director-stage-workbench-ui-20260601173958"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }

log "verify package markers"
grep -q "name:'3D导演台'" "$HTML"
grep -q "director-stage-node-compact" "$HTML"
grep -q "director-stage-workbench-modal" "$HTML"
grep -q "function renderDirectorStageWorkbenchContent" "$HTML"
grep -q "function renderDirectorStageWorkbenchDialog" "$HTML"
grep -q "function openDirectorStageWorkbench" "$HTML"
grep -q "function directorStageRuntimeKey" "$HTML"
grep -q "data-director-action=\"openWorkbench\"" "$HTML"
grep -q "data-director-surface=\"workbench\"" "$HTML"
grep -q "!isPreviewSurface&&THREE.TransformControls" "$HTML"

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "verify installed markers"
run_sudo grep -q "name:'3D导演台'" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "director-stage-node-compact" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "director-stage-workbench-modal" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function renderDirectorStageWorkbenchContent" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function renderDirectorStageWorkbenchDialog" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function openDirectorStageWorkbench" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function directorStageRuntimeKey" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "data-director-action=\"openWorkbench\"" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "data-director-surface=\"workbench\"" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "!isPreviewSurface&&THREE.TransformControls" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "reload services if available"
run_sudo systemctl restart ai-admin 2>/dev/null || true
run_sudo systemctl reload nginx 2>/dev/null || true

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
