#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-video-duration-by-resolution-fix-20260603223314"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/${PKG}-${STAMP}"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

[ -f "$ARCHIVE" ] || fail "找不到部署包: $ARCHIVE"
[ -d "$WORKBENCH_ROOT" ] || fail "找不到画布目录: $WORKBENCH_ROOT"

run_sudo mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/workbench-web"

log "解压 $ARCHIVE"
run_sudo tar -xzf "$ARCHIVE" -C "$DEPLOY_DIR"
SRC_ROOT="$DEPLOY_DIR"
if [ -d "$DEPLOY_DIR/$PKG" ]; then
  SRC_ROOT="$DEPLOY_DIR/$PKG"
fi
SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "包内缺少 workbench-web/image-studio-canvas-next.html"

log "校验包内补丁"
grep -Fq "normalizeVideoDurationMap" "$SRC"
grep -Fq "firstVideoMaxDurationByResolution" "$SRC"
grep -Fq "maxVideoDurationSecondsByResolution" "$SRC"
grep -Fq "durationsByResolution[activeResolution]" "$SRC"
grep -Fq "value<=resolutionMaxSeconds" "$SRC"

log "备份线上文件到 $BACKUP_DIR"
if [ -f "$WORKBENCH_ROOT/image-studio-canvas-next.html" ]; then
  run_sudo cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"
fi

log "覆盖画布 HTML"
run_sudo install -m 0644 "$SRC" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  run_sudo install -m 0644 "$SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "校验线上补丁"
grep -Fq "normalizeVideoDurationMap" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -Fq "firstVideoMaxDurationByResolution" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -Fq "maxVideoDurationSecondsByResolution" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -Fq "durationsByResolution[activeResolution]" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -Fq "value<=resolutionMaxSeconds" "$WORKBENCH_ROOT/image-studio-canvas-next.html"

log "部署完成。备份目录: $BACKUP_DIR"
log "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
