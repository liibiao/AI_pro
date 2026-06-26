#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-local-media-upload-jitter-fix-20260611022213"
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
  grep -Fq "const localPreview=collectVideoUrlCandidates([" "$file"
  grep -Fq "const hasLocalPreview=isDataImageUrl(img.dataUrl)||isBlobUrl(img.dataUrl)||isBlobUrl(img.url)||isBlobUrl(img.previewUrl);" "$file"
  grep -Fq "img.objectStorageUrl=ref;" "$file"
  grep -Fq "const hasLocalPreview=isDataMediaUrl(localUrl)||isBlobUrl(localUrl)||isDataMediaUrl(media.url)||isBlobUrl(media.url);" "$file"
  grep -Fq "Object.assign(n.values,{remoteUrl:publicUrl,objectStorageUrl:publicUrl,contentUrl:publicUrl,downloadUrl:publicUrl,mediaType:'video'});" "$file"
  grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.previewUrl,entry?.url,entry?.localUrl" "$file"
  grep -Fq "updateUploadProgressLight(id);refreshDownstreamAfterConnectionChange(downstreamNodeIds(id));" "$file"
  if grep -Fq "computeNode(id);rerenderNode(id);refreshDownstreamAfterConnectionChange(downstreamNodeIds(id));" "$file"; then
    fail "retry upload still forces full rerender in $file"
  fi
}
verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "const localPreview=collectVideoUrlCandidates([" "$file"
  run_sudo grep -Fq "const hasLocalPreview=isDataImageUrl(img.dataUrl)||isBlobUrl(img.dataUrl)||isBlobUrl(img.url)||isBlobUrl(img.previewUrl);" "$file"
  run_sudo grep -Fq "img.objectStorageUrl=ref;" "$file"
  run_sudo grep -Fq "const hasLocalPreview=isDataMediaUrl(localUrl)||isBlobUrl(localUrl)||isDataMediaUrl(media.url)||isBlobUrl(media.url);" "$file"
  run_sudo grep -Fq "Object.assign(n.values,{remoteUrl:publicUrl,objectStorageUrl:publicUrl,contentUrl:publicUrl,downloadUrl:publicUrl,mediaType:'video'});" "$file"
  run_sudo grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.previewUrl,entry?.url,entry?.localUrl" "$file"
  run_sudo grep -Fq "updateUploadProgressLight(id);refreshDownstreamAfterConnectionChange(downstreamNodeIds(id));" "$file"
  if run_sudo grep -Fq "computeNode(id);rerenderNode(id);refreshDownstreamAfterConnectionChange(downstreamNodeIds(id));" "$file"; then
    fail "retry upload still forces full rerender in $file"
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
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public workbench canvas"
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi
if [ -d "$WEB_ROOT" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html" "public root canvas"
  installed=1
else
  log "public root skipped, not found: $WEB_ROOT"
fi
if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

[ "$installed" = "1" ] || fail "no canvas target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WEB_ROOT/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WEB_ROOT/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
