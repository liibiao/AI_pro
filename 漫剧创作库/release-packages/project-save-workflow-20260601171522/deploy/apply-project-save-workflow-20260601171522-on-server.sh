#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="project-save-workflow-20260601171522"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "this deploy writes to $TARGET; please run it with sudo" >&2
  exit 1
fi
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

log "backup current canvas"
mkdir -p "$BACKUP_DIR/tools/workbench-web"
cp -p "$DEST" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"

DEST_OWNER="$(stat -c '%u:%g' "$DEST")"
DEST_MODE="$(stat -c '%a' "$DEST")"

log "install project save workflow build"
install -m "$DEST_MODE" "$SRC" "$DEST"
chown "$DEST_OWNER" "$DEST"

log "verify project save markers"
grep -Fq "CANVAS_PROJECTS_KEY='mjb_canvas_projects_v1'" "$DEST"
grep -Fq "function createCanvasProjectFromName" "$DEST"
grep -Fq "function saveCurrentProjectWorkflowRaw" "$DEST"
grep -Fq "function switchCanvasProject" "$DEST"
grep -Fq "function saveCurrentWorkflowToProject" "$DEST"
grep -Fq "id=\"projectMenuBtn\"" "$DEST"
grep -Fq "id=\"projectSelect\"" "$DEST"
grep -Fq "data-tip=\"保存项目\"" "$DEST"
grep -Fq "asset-workspace-bar{display:none!important" "$DEST"
grep -Fq "canvasAssetStorageKey(projectId=null)" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
