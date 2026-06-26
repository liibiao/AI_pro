#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-next-storyboard-image-output-table-fix-20260604113656"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_ROOT="${MIRROR_ROOT:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}
backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}
install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}
verify_html(){
  local file="$1"
  grep -Fq "function extractStoryboardTableFromPromptText(text)" "$file"
  grep -Fq "function storyboardTableTextFromData(data)" "$file"
  grep -Fq "function storyboardTableTextFromSourceNode(source)" "$file"
  grep -Fq "function shotTablePickNarrativeCell(cells,headers)" "$file"
  grep -Fq "data.storyboardTable||data.tableText" "$file"
  grep -Fq "storyboardTable:text" "$file"
  grep -Fq "storyboardTable:tableText" "$file"
  grep -Fq "_sourceStoryboardTableText:tableText" "$file"
  grep -Fq "if(isShotSurface)return;" "$file"
  grep -Fq "handle.addEventListener('pointerdown',e=>{e.stopPropagation();});" "$file"
  grep -Fq "function storyboardImageCropRegions(img,grid)" "$file"
  grep -Fq "function createStoryboardCompositeImageNode(sourceId,imageEntry,opts={})" "$file"
  grep -Fq "const image=await recomposeStoryboardShots(n,{selectedOnly:true});" "$file"
  if grep -Fq "Math.hypot(dx,dy)>7" "$file"; then
    fail "old whole-cell reorder drag threshold still present in $file"
  fi
  if grep -Fq "_shotToggleAt" "$file"; then
    fail "old shot toggle click suppression marker still present in $file"
  fi
}
verify_html_sudo(){
  local file="$1"
  run_sudo grep -Fq "function extractStoryboardTableFromPromptText(text)" "$file"
  run_sudo grep -Fq "function storyboardTableTextFromData(data)" "$file"
  run_sudo grep -Fq "function storyboardTableTextFromSourceNode(source)" "$file"
  run_sudo grep -Fq "function shotTablePickNarrativeCell(cells,headers)" "$file"
  run_sudo grep -Fq "data.storyboardTable||data.tableText" "$file"
  run_sudo grep -Fq "storyboardTable:text" "$file"
  run_sudo grep -Fq "storyboardTable:tableText" "$file"
  run_sudo grep -Fq "_sourceStoryboardTableText:tableText" "$file"
  run_sudo grep -Fq "if(isShotSurface)return;" "$file"
  run_sudo grep -Fq "handle.addEventListener('pointerdown',e=>{e.stopPropagation();});" "$file"
  run_sudo grep -Fq "function storyboardImageCropRegions(img,grid)" "$file"
  run_sudo grep -Fq "function createStoryboardCompositeImageNode(sourceId,imageEntry,opts={})" "$file"
  run_sudo grep -Fq "const image=await recomposeStoryboardShots(n,{selectedOnly:true});" "$file"
  if grep -Fq "Math.hypot(dx,dy)>7" "$file"; then
    fail "old whole-cell reorder drag threshold still present in $file"
  fi
  if grep -Fq "_shotToggleAt" "$file"; then
    fail "old shot toggle click suppression marker still present in $file"
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_ROOT/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
else
  log "mirror workbench skipped, not found: $MIRROR_ROOT/tools/workbench-web"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_html_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
