#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-runtime-cleanup-perf-fix-20260602173528"
ARCHIVE="${1:-}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$ARCHIVE" ] || fail "missing archive path"
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${TS}"
mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi
cp -p "$SRC" "$DEST"
log "installed $DEST"

MIRROR_DEST="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  cp -p "$SRC" "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

grep -Fq "const VIDEO_PREVIEW_FAILURE_COOLDOWN_MS=45000" "$DEST"
grep -Fq "function toastVideoPlaybackFailure" "$DEST"
grep -Fq "function canAttemptGeneratedVideoRecovery" "$DEST"
grep -Fq "const GENERATED_VIDEO_RECOVERY_MAX_ATTEMPTS=2" "$DEST"
grep -Fq "target.values._autoplayPending=shouldAutoplay" "$DEST"
grep -Fq "toastVideoPlaybackFailure('视频加载失败','err',5000)" "$DEST"
grep -Fq "const partialDirty=!syncPorts&&!!dirtyIds" "$DEST"
grep -Fq "if(alignSvg.firstChild)alignSvg.innerHTML = ''" "$DEST"
grep -Fq "function cleanupNodeRuntime" "$DEST"
grep -Fq "function cleanupCanvasRuntimeQueues" "$DEST"
grep -Fq "cleanupNodeRuntime(id,el)" "$DEST"
grep -Fq "el?._cleanupFns?.forEach" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
