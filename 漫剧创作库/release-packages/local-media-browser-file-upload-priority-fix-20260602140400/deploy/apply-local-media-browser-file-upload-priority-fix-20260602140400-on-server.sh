#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="local-media-browser-file-upload-priority-fix-20260602140400"
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
SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
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

grep -Fq "const sourceFile=img.file||img._file||img.blob" "$DEST"
grep -Fq "img.saved?.cachedDataUrl,img.saved?.localUrl,img.saved?.url" "$DEST"
grep -Fq ".find(v=>/^data:image\\//i.test(v)||isBlobUrl(v))" "$DEST"
grep -Fq "async function uploadBrowserImageForProvider(nodeId,img,label='参考图'" "$DEST"
grep -Fq "async function uploadBrowserImageToObjectStorageForVideo(nodeId,img,label='视频参考图')" "$DEST"
if grep -Fq "async function uploadBrowserImageToObjectStorageForVideo(nodeId,img,label='视频参考图'){" "$DEST"; then
  BLOCK="$(sed -n '/async function uploadBrowserImageToObjectStorageForVideo(nodeId,img,label=.视频参考图.){/,/async function uploadLocalImageToObjectStorageForVideo/p' "$DEST")"
  if printf '%s\n' "$BLOCK" | grep -Fq "if(img?.localPath||img?.saved?.localPath||img?.saved?.path)return"; then
    fail "browser image COS upload still skips File/blob when localPath exists"
  fi
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
