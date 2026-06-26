#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="image-toolbar-ui-fix-20260603233136"
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
  log "installed $dest"
}
verify_markers(){
  local html="$1"
  local css="$2"
  grep -Fq "image-toolbar-ui-fix" "$html"
  grep -Fq "host.classList.add('has-tn-control')" "$html"
  grep -Fq 'data-image-action-panel="${n.id}" aria-label' "$html"
  if grep -Fq 'class="image-action-label"' "$html"; then
    fail "image action picker still renders visible labels: $html"
  fi
  grep -Fq ".image-action-control.has-tn-control" "$css"
  grep -Fq ".refine-control.has-tn-control" "$css"
  grep -Fq ".image-action-picker .image-action-label{display:none}" "$css"
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_markers "$SRC/workbench-web/image-studio-canvas-next.html" "$SRC/workbench-web/canvas-next/tapnow-rewrite.css"
verify_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/canvas-next/tapnow-rewrite.css" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css" "public tapnow css"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css" "mirror tapnow css"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_markers "$WORKBENCH_DIR/image-studio-canvas-next.html" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_markers "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
