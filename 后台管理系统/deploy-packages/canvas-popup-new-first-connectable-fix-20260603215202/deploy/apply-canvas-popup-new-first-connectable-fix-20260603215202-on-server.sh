#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-popup-new-first-connectable-fix-20260603215202"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${STAMP}"
SUDO=""

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -d "$(dirname "$HTML_DEST")" ] || fail "web canvas dir not found: $(dirname "$HTML_DEST")"

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

HTML_SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$HTML_SRC" ]; then
  HTML_SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
fi
[ -f "$HTML_SRC" ] || fail "image-studio-canvas-next.html not found in package"

run_sudo mkdir -p "$BACKUP_DIR" "$(dirname "$HTML_DEST")"

if [ -f "$HTML_DEST" ]; then
  run_sudo cp -p "$HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

run_sudo install -m 0644 "$HTML_SRC" "$HTML_DEST"
log "installed $HTML_DEST"

if [ -d "$(dirname "$MIRROR_HTML_DEST")" ]; then
  if [ -f "$MIRROR_HTML_DEST" ]; then
    run_sudo cp -p "$MIRROR_HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_HTML_DEST"
  log "updated $MIRROR_HTML_DEST"
fi

log "verify markers"
grep -Fq "function inputPortCanAcceptConnection" "$HTML_DEST"
grep -Fq "return current===0;" "$HTML_DEST"
grep -Fq "return current<MAX_MULTI_CONN;" "$HTML_DEST"
grep -Fq "priority:2" "$HTML_DEST"
grep -Fq "新建节点在上，现有可连接节点在下" "$HTML_DEST"
grep -Fq "conn-target-sep\">可连接节点" "$HTML_DEST"
grep -Fq "newTargets=[],existingTargets=[]" "$HTML_DEST"
grep -Fq "inputPortCanAcceptConnection(id,outPort.id,node.id,inp.id,outPort.kind)" "$HTML_DEST"
grep -Fq "quickDownstream(n.id,{anchorEl:e.currentTarget})" "$HTML_DEST"
grep -Fq "function showDownstreamPopupFromConnect" "$HTML_DEST"
grep -Fq "function markConnTargetPopupOpened" "$HTML_DEST"
grep -Fq "keepFreshConnTarget" "$HTML_DEST"
grep -Fq "始终给出可新建的下游节点选择" "$HTML_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
