#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/asset-design-template-20260601004856.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/asset-design-template-20260601004856-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/asset-design-template-20260601004856-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/asset-design-template-20260601004856"
test -f "$SRC/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -d "$SRC/workbench-web/assets/template-previews" || { echo "部署包缺少 template-previews 资源目录" >&2; exit 1; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web/assets"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/assets/template-previews" "$BACKUP/workbench-web/assets/template-previews" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "install template preview assets"
run_sudo mkdir -p "$WORKBENCH_DIR/assets/template-previews"
run_sudo cp -f "$SRC"/workbench-web/assets/template-previews/* "$WORKBENCH_DIR/assets/template-previews/"

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench files"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/assets/template-previews"
  run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  run_sudo cp -f "$SRC"/workbench-web/assets/template-previews/* "$MIRROR_WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chown -R www-data:www-data "$WORKBENCH_DIR/assets/template-previews" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR"/assets/template-previews/* 2>/dev/null || true

log "verify markers"
run_sudo grep -q "ASSET_TEMPLATE_PREVIEW_BASE='assets/template-previews/'" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "pink_nine_grid_character_sheet" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "industrial_idol_blueprint" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "cn_multi_angle_archive" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "gentle_cn_full_asset_sheet" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "asset-template-menu::-webkit-scrollbar" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "scrollbar-width:none" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo test -f "$WORKBENCH_DIR/assets/template-previews/asset-ref-01-nine-grid.jpg"
run_sudo test -f "$WORKBENCH_DIR/assets/template-previews/asset-ref-12-cn-gentle.jpg"
run_sudo test -f "$WORKBENCH_DIR/assets/template-previews/asset-prop-blueprint.png"
COUNT="$(run_sudo find "$WORKBENCH_DIR/assets/template-previews" -maxdepth 1 -type f | wc -l | tr -d ' ')"
test "$COUNT" -ge 16 || { echo "缩略图资源数量不足: $COUNT" >&2; exit 1; }

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
