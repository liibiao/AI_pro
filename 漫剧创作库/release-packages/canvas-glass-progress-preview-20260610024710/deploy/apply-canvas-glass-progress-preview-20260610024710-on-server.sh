#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-glass-progress-preview-20260610024710"
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
verify_html(){
  local file="$1"
  grep -Fq "20260610-glass-progress-preview" "$file"
  grep -Fq "background:linear-gradient(180deg,rgba(206,225,226,.24),rgba(28,44,45,.34)),rgba(6,9,12,.34)!important" "$file"
  grep -Fq "font-size:28px!important" "$file"
  grep -Fq "blur(22px) saturate(1.18) brightness(.92)" "$file"
  if grep -Fq "transform:scaleX(var(--gen-progress-ratio" "$file"; then
    fail "legacy bottom progress scale remains in $file"
  fi
}
verify_css(){
  local file="$1"
  grep -Fq "Running progress: frosted overlay inside preview" "$file"
  grep -Fq "blur(22px) saturate(1.18) brightness(.92)" "$file"
  grep -Fq ".gen-progress-text b{display:block!important;font-size:28px!important" "$file"
  if grep -Fq "gen-progress-mask::before{animation:tnProgressAurora" "$file"; then
    fail "legacy progress aurora animation remains in $file"
  fi
}
verify_renderer(){
  local file="$1"
  grep -Fq "function renderProgressOverlay" "$file"
  grep -Fq "function modeProgressLabel" "$file"
  grep -Fq "renderProgressOverlay(node,modeProgressLabel(mode))" "$file"
}
verify_installed(){
  local root="$1"
  run_sudo grep -Fq "20260610-glass-progress-preview" "$root/image-studio-canvas-next.html"
  run_sudo grep -Fq "font-size:28px!important" "$root/image-studio-canvas-next.html"
  run_sudo grep -Fq "Running progress: frosted overlay inside preview" "$root/canvas-next/tapnow-rewrite.css"
  run_sudo grep -Fq "function renderProgressOverlay" "$root/canvas-next/renderers.js"
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
verify_css "$SRC/workbench-web/canvas-next/tapnow-rewrite.css"
verify_css "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"
verify_renderer "$SRC/workbench-web/canvas-next/renderers.js"
verify_renderer "$SRC/tools/workbench-web/canvas-next/renderers.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/canvas-next/tapnow-rewrite.css" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css" "public progress css"
  install_file "$SRC/workbench-web/canvas-next/renderers.js" "$WORKBENCH_DIR/canvas-next/renderers.js" "public renderer"
  verify_installed "$WORKBENCH_DIR"
  installed=$((installed+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css" "mirror progress css"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/renderers.js" "mirror renderer"
  verify_installed "$MIRROR_TARGET/tools/workbench-web"
  installed=$((installed+1))
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css" "runtime progress css"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/renderers.js" "runtime renderer"
fi

[ "$installed" -gt 0 ] || fail "no public or mirror workbench target found"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
