#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="director-stage-mannequin-rebuild-camera-ui-20260601235918"
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

log "install rebuilt mannequin and camera UI"
install -m "$DEST_MODE" "$SRC" "$DEST"
if [ -n "$DEST_OWNER" ]; then
  chown "$DEST_OWNER" "$DEST" 2>/dev/null || log "skip owner restore; run with sudo if ownership matters"
fi

log "verify director stage markers"
grep -Fq "Hidden handles above keep pose editing precise" "$DEST"
grep -Fq "makeShellSphere('chest',[.225,.230,.130]" "$DEST"
grep -Fq "makeShellSphere('shoulder'+side,[.090,.094,.082]" "$DEST"
grep -Fq "makeShellSegment('hip'+side,'thigh'+side,.086" "$DEST"
grep -Fq "data-director-camera-preset=\"full\"" "$DEST"
grep -Fq "data-director-camera-preset=\"medium\"" "$DEST"
grep -Fq "data-director-camera-preset=\"side\"" "$DEST"
grep -Fq "data-director-camera-preset=\"top\"" "$DEST"
grep -Fq "function directorStageSetViewPreset" "$DEST"
grep -Fq "保存机位" "$DEST"
grep -Fq "directorStageCanvasSnapshotDataUrl" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
