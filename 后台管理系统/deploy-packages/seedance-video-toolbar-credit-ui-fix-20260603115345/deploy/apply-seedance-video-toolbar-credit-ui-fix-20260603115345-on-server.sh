#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance-video-toolbar-credit-ui-fix-20260603115345"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
DEST="$WORKBENCH_DIR/image-studio-canvas-next.html"
MIRROR_DEST="$MIRROR_DIR/image-studio-canvas-next.html"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/${PKG}.XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

cleanup(){ rm -rf "$WORK"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK"
SRC="$WORK/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${STAMP}"
log "backup $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR" "$WORKBENCH_DIR"
if [ -f "$DEST" ]; then
  run_sudo cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

log "install workbench html"
run_sudo install -m 0644 "$SRC" "$DEST"

if [ -d "$MIRROR_DIR" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    run_sudo cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  run_sudo install -m 0644 "$SRC" "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

log "verify markers"
run_sudo grep -Fq ".credit-estimate-pill.compact" "$DEST"
run_sudo grep -Fq "credit-estimate-icon" "$DEST"
run_sudo grep -Fq "function renderCreditEstimatePill(n,opts={})" "$DEST"
run_sudo grep -Fq "renderCreditEstimatePill(n,{compact:true})" "$DEST"
if run_sudo grep -Fq '<button class="vn2-expand-btn' "$DEST"; then
  fail "old seedance prompt expand button still exists"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
