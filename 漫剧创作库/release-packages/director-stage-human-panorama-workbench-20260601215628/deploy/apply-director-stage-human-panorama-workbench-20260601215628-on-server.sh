#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="director-stage-human-panorama-workbench-20260601215628"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi
if [ ! -d "$TARGET/tools/workbench-web" ]; then
  echo "target workbench not found: $TARGET/tools/workbench-web" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
DEST="$TARGET/tools/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$SRC" ]; then
  echo "package file missing: $SRC" >&2
  exit 1
fi
if [ ! -f "$DEST" ]; then
  echo "target canvas file not found: $DEST" >&2
  exit 1
fi

log "backup current canvas"
mkdir -p "$BACKUP_DIR/tools/workbench-web"
cp -p "$DEST" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"

DEST_OWNER="$(stat -c '%u:%g' "$DEST" 2>/dev/null || true)"
DEST_MODE="$(stat -c '%a' "$DEST" 2>/dev/null || echo 0644)"

log "install 3D director stage human panorama workbench build"
install -m "$DEST_MODE" "$SRC" "$DEST"
if [ -n "$DEST_OWNER" ]; then
  chown "$DEST_OWNER" "$DEST" 2>/dev/null || log "skip owner restore; run with sudo if ownership matters"
fi

log "verify director stage markers"
grep -Fq "backgroundMode:'panorama360'" "$DEST"
grep -Fq "360° 等矩形全景图" "$DEST"
grep -Fq "panorama-360-background" "$DEST"
grep -Fq "3D导演台 · 全屏详情操作台" "$DEST"
grep -Fq ".director-stage-workbench-modal{position:fixed;inset:0" "$DEST"
grep -Fq "grid-template-columns:minmax(0,1fr) minmax(320px,380px)" "$DEST"
grep -Fq "flex-wrap:nowrap;overflow-x:auto" "$DEST"
grep -Fq "makeShellSegment('pelvis','waist',.15,core,'pelvis-to-waist-shell')" "$DEST"
grep -Fq "capsule('pelvis','chest',.115,'fallback-torso')" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
