#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="project-save-workflow-cards-public-20260601215613"
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
  grep -Fq "CANVAS_PROJECTS_KEY='mjb_canvas_projects_v1'" "$dest"
  grep -Fq "function createCanvasProjectFromName" "$dest"
  grep -Fq "function saveCurrentProjectWorkflowRaw" "$dest"
  grep -Fq "function switchCanvasProject" "$dest"
  grep -Fq "function saveCurrentWorkflowToProject" "$dest"
  grep -Fq "id=\"projectMenuBtn\"" "$dest"
  grep -Fq "id=\"projectCardRail\"" "$dest"
  grep -Fq "project-card-rail" "$dest"
  grep -Fq "data-project-new-card" "$dest"
  grep -Fq "project-select-hidden" "$dest"
  grep -Fq "asset-workspace-bar{display:none!important" "$dest"
  grep -Fq "canvasAssetStorageKey(projectId=null)" "$dest"
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
echo "Hard-refresh the canvas page after deploy. If nginx caches static HTML, reload nginx too."
