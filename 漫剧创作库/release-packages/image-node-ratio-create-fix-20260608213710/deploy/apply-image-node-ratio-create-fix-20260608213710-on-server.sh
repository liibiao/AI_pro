#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="image-node-ratio-create-fix-20260608213710"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

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
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}
verify_html_markers(){
  local file="$1"
  grep -Fq "function assetMediaMetaFromTask(task,index=0,url='')" "$file"
  grep -Fq "function assetImageEntry(task,url,index=0)" "$file"
  grep -Fq "const sizeMeta=meta.width>0&&meta.height>0?{width:meta.width,height:meta.height,actualSize:" "$file"
  grep -Fq "function createPendingDerivedImageEntry(dataUrl,opts={})" "$file"
  grep -Fq "resultJson:{url,mediaType:media,...sizeMeta,...durationMeta}" "$file"
  grep -Fq "syncImageNodeSize(S.nodes[nid]);" "$file"
  grep -Fq "function createDerivedSingleImageNode(sourceId,entry,opts={})" "$file"
  grep -Fq "function getImageRatioFromEntry(entry){" "$file"
  grep -Fq "entry?.dimensions?.width" "$file"
  grep -Fq "function applyVideoModelConstraints(v,{pruneImages=false,pruneMedia=false}={})" "$file"
  grep -Fq "if(pruneImages&&(v.images||[]).length>caps.maxImages)v.images=v.images.slice(0,caps.maxImages);" "$file"
  grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.objectStorageUrl,entry?.saved?.objectStorageUrl,...generatedAssetPreviewUrls(entry)," "$file"
  grep -Fq "display.canvasPreviewDebug=buildImagePreviewDebug(n);" "$file"
  if grep -Fq 'if((v.images||[]).length>caps.maxImages)v.images=v.images.slice(0,caps.maxImages);' "$file"; then
    fail "video reference images are still pruned during normal constraint application in $file"
  fi
  if grep -Fq 'setMediaReferenceList(n.values,kind,[]);' "$file"; then
    fail "video reference media is still deleted when unsupported during refresh in $file"
  fi
}
verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function assetMediaMetaFromTask(task,index=0,url='')" "$file"
  run_sudo grep -Fq "function assetImageEntry(task,url,index=0)" "$file"
  run_sudo grep -Fq "const sizeMeta=meta.width>0&&meta.height>0?{width:meta.width,height:meta.height,actualSize:" "$file"
  run_sudo grep -Fq "function createPendingDerivedImageEntry(dataUrl,opts={})" "$file"
  run_sudo grep -Fq "resultJson:{url,mediaType:media,...sizeMeta,...durationMeta}" "$file"
  run_sudo grep -Fq "syncImageNodeSize(S.nodes[nid]);" "$file"
  run_sudo grep -Fq "function createDerivedSingleImageNode(sourceId,entry,opts={})" "$file"
  run_sudo grep -Fq "function getImageRatioFromEntry(entry){" "$file"
  run_sudo grep -Fq "entry?.dimensions?.width" "$file"
  run_sudo grep -Fq "function applyVideoModelConstraints(v,{pruneImages=false,pruneMedia=false}={})" "$file"
  run_sudo grep -Fq "if(pruneImages&&(v.images||[]).length>caps.maxImages)v.images=v.images.slice(0,caps.maxImages);" "$file"
  run_sudo grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.objectStorageUrl,entry?.saved?.objectStorageUrl,...generatedAssetPreviewUrls(entry)," "$file"
  run_sudo grep -Fq "display.canvasPreviewDebug=buildImagePreviewDebug(n);" "$file"
  if run_sudo grep -Fq 'if((v.images||[]).length>caps.maxImages)v.images=v.images.slice(0,caps.maxImages);' "$file"; then
    fail "video reference images are still pruned during normal constraint application in $file"
  fi
  if run_sudo grep -Fq 'setMediaReferenceList(n.values,kind,[]);' "$file"; then
    fail "video reference media is still deleted when unsupported during refresh in $file"
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
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_html_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
