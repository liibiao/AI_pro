#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-preview-stop-retry-fix-20260603101631"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  $SUDO cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

$SUDO install -m 0644 "$SRC" "$DEST"
log "installed $DEST"

if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    $SUDO cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  $SUDO install -m 0644 "$SRC" "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

log "verify markers"
grep -Fq "VIDEO_PREVIEW_TERMINAL_COOLDOWN_MS=10*60*1000" "$DEST"
grep -Fq "function markVideoPreviewTerminalFailure" "$DEST"
grep -Fq "rememberNodeVideoPreviewFailure" "$DEST"
grep -Fq "videoPreviewTerminalFailed" "$DEST"
grep -Fq "toastVideoPlaybackFailure('视频加载失败','err',30000)" "$DEST"
if grep -Fq "if(count<2){setTimeout(()=>{try{videoEl.load();}catch(_){}},800*(count+1));return;}" "$DEST"; then
  fail "old timed video preview reload retry still exists"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
