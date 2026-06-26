#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-connection-converge-anchor-20260612040758"
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
verify_canvas_next_html(){
  local file="$1"
  grep -Fq 'function rectFacingAnchor(r,otherPoint=null)' "$file"
  grep -Fq "const fromCenter=nodeFastEdgePoint(c.from,'out',rectCache),toCenter=nodeFastEdgePoint(c.to,'in',rectCache);" "$file"
  grep -Fq "const start=nodeFastEdgePoint(c.from,'out',rectCache,toCenter),end=nodeFastEdgePoint(c.to,'in',rectCache,fromCenter);" "$file"
  grep -Fq 'function screenRectToWorldRect(r,sr)' "$file"
  grep -Fq 'return rectFacingAnchor(screenRectToWorldRect(r,sr),otherPoint);' "$file"
}
verify_canvas_next_renderer(){
  local file="$1"
  grep -Fq 'function rectFacingAnchor(r,otherPoint)' "$file"
  grep -Fq 'const startCenter=connectionAnchor(a,sr);' "$file"
  grep -Fq 'const start=connectionAnchor(a,sr,endCenter);' "$file"
  grep -Fq 'const anchor=connectionAnchor(a,sr,{x:tx,y:ty});' "$file"
}
verify_legacy_html(){
  local file="$1"
  grep -Fq 'function rectFacingAnchor(r,otherPoint)' "$file"
  grep -Fq "const fromCenter=nodeEdgePoint(c.from,'out'),toCenter=nodeEdgePoint(c.to,'in');" "$file"
  grep -Fq "const start=nodeEdgePoint(c.from,'out',toCenter),end=nodeEdgePoint(c.to,'in',fromCenter);" "$file"
  grep -Fq 'return rectFacingAnchor({left:r.left-sr.left,top:r.top-sr.top,width:r.width,height:r.height},otherPoint);' "$file"
}
verify_canvas_next_html_sudo(){
  local file="$1"
  run_sudo grep -Fq 'function rectFacingAnchor(r,otherPoint=null)' "$file"
  run_sudo grep -Fq "const fromCenter=nodeFastEdgePoint(c.from,'out',rectCache),toCenter=nodeFastEdgePoint(c.to,'in',rectCache);" "$file"
  run_sudo grep -Fq "const start=nodeFastEdgePoint(c.from,'out',rectCache,toCenter),end=nodeFastEdgePoint(c.to,'in',rectCache,fromCenter);" "$file"
  run_sudo grep -Fq 'function screenRectToWorldRect(r,sr)' "$file"
  run_sudo grep -Fq 'return rectFacingAnchor(screenRectToWorldRect(r,sr),otherPoint);' "$file"
}
verify_canvas_next_renderer_sudo(){
  local file="$1"
  run_sudo grep -Fq 'function rectFacingAnchor(r,otherPoint)' "$file"
  run_sudo grep -Fq 'const startCenter=connectionAnchor(a,sr);' "$file"
  run_sudo grep -Fq 'const start=connectionAnchor(a,sr,endCenter);' "$file"
  run_sudo grep -Fq 'const anchor=connectionAnchor(a,sr,{x:tx,y:ty});' "$file"
}
verify_legacy_html_sudo(){
  local file="$1"
  run_sudo grep -Fq 'function rectFacingAnchor(r,otherPoint)' "$file"
  run_sudo grep -Fq "const fromCenter=nodeEdgePoint(c.from,'out'),toCenter=nodeEdgePoint(c.to,'in');" "$file"
  run_sudo grep -Fq "const start=nodeEdgePoint(c.from,'out',toCenter),end=nodeEdgePoint(c.to,'in',fromCenter);" "$file"
  run_sudo grep -Fq 'return rectFacingAnchor({left:r.left-sr.left,top:r.top-sr.top,width:r.width,height:r.height},otherPoint);' "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_canvas_next_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_next_renderer "$SRC/workbench-web/canvas-next/renderers.js"
verify_canvas_next_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_canvas_next_renderer "$SRC/tools/workbench-web/canvas-next/renderers.js"
verify_canvas_next_renderer "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
verify_legacy_html "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next html"
  install_file "$SRC/workbench-web/canvas-next/renderers.js" "$WORKBENCH_DIR/canvas-next/renderers.js" "public canvas next renderer"
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next html"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/renderers.js" "mirror canvas next renderer"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  log "install smart-vision legacy workbench"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "legacy canvas next renderer"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "legacy canvas html"
  installed=1
else
  log "smart-vision legacy skipped, not found"
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then verify_canvas_next_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if [ -f "$WORKBENCH_DIR/canvas-next/renderers.js" ]; then verify_canvas_next_renderer_sudo "$WORKBENCH_DIR/canvas-next/renderers.js"; fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then verify_canvas_next_html_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/canvas-next/renderers.js" ]; then verify_canvas_next_renderer_sudo "$MIRROR_TARGET/tools/workbench-web/canvas-next/renderers.js"; fi
if [ -f "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" ]; then verify_canvas_next_renderer_sudo "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"; fi
if [ -f "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" ]; then verify_legacy_html_sudo "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"; fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
