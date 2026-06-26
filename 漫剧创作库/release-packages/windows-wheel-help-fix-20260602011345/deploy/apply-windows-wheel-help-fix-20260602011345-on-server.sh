#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="windows-wheel-help-fix-20260602011345"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_ROOT="${MIRROR_TARGET}/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "this deploy writes public workbench files; please run it with sudo" >&2
  exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

PUBLIC_SRC="$TMP_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
MIRROR_SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$PUBLIC_SRC" ]; then
  echo "package file missing: $PUBLIC_SRC" >&2
  exit 1
fi

install_canvas_file(){
  local src="$1"
  local dest="$2"
  local label="$3"
  local dest_dir
  dest_dir="$(dirname "$dest")"
  if [ ! -d "$dest_dir" ]; then
    echo "$label directory not found: $dest_dir" >&2
    return 1
  fi
  if [ ! -f "$dest" ]; then
    echo "$label file not found: $dest" >&2
    return 1
  fi
  local backup_dir="$BACKUP_ROOT/$label"
  mkdir -p "$backup_dir"
  cp -p "$dest" "$backup_dir/image-studio-canvas-next.html"
  local owner mode
  owner="$(stat -c '%u:%g' "$dest")"
  mode="$(stat -c '%a' "$dest")"
  install -m "$mode" "$src" "$dest"
  chown "$owner" "$dest"
  echo "$dest"
}

verify_markers(){
  local dest="$1"
  grep -Fq "windowsDirectWheelZoom" "$dest"
  grep -Fq "if(e.ctrlKey||windowsDirectWheelZoom)" "$dest"
  grep -Fq "['缩放画布','双指捏合 / Command + 滚轮','滚轮']" "$dest"
  grep -Fq "function actionPreviewSource" "$dest"
  grep -Fq "inp.blur?.();" "$dest"
  if grep -Fq "['缩放画布','双指捏合 / Command + 滚轮','Ctrl + 滚轮']" "$dest"; then
    echo "shortcut help still shows Ctrl + wheel for Windows zoom" >&2
    return 1
  fi
  if grep -Fq "data-video-inline-more" "$dest"; then
    echo "video inline large-preview button was not removed" >&2
    return 1
  fi
}

UPDATED=()

log "install public workbench canvas: $WORKBENCH_DIR"
PUBLIC_DEST="$WORKBENCH_DIR/image-studio-canvas-next.html"
install_canvas_file "$PUBLIC_SRC" "$PUBLIC_DEST" "public-workbench"
verify_markers "$PUBLIC_DEST"
UPDATED+=("$PUBLIC_DEST")

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror canvas: $MIRROR_TARGET/tools/workbench-web"
  MIRROR_DEST="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
  install_canvas_file "$MIRROR_SRC" "$MIRROR_DEST" "mirror-workbench"
  verify_markers "$MIRROR_DEST"
  UPDATED+=("$MIRROR_DEST")
else
  log "mirror target not found, skipped: $MIRROR_TARGET/tools/workbench-web"
fi

log "done"
echo "updated:"
printf ' - %s\n' "${UPDATED[@]}"
echo "backup: $BACKUP_ROOT"
echo "Hard-refresh the canvas page after deploy."
