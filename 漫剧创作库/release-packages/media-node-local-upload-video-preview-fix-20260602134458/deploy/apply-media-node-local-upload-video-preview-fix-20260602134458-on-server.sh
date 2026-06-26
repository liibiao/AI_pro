#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="media-node-local-upload-video-preview-fix-20260602134458"
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

grep -Fq "function nextVideoFallbackUrl(video,node)" "$DEST"
grep -Fq "function scheduleLocalAssetMediaUpload(id,entry,kind='video',task=null)" "$DEST"
grep -Fq "function scheduleLocalAssetImageUpload(id,entry,task=null,label='本地图片')" "$DEST"
grep -Fq "const contentCandidates=collectVideoUrlCandidates([remoteContentUrl,statusData.downloadUrl,statusData.contentUrl" "$DEST"
grep -Fq "function normalizeLoadedMediaEntry(entry,kind='video')" "$DEST"
grep -Fq "delete n.values.status;delete n.values.progress;delete n.values.progressLabel" "$DEST"
grep -Fq "return attachTransientFile(task,file)" "$DEST"
if grep -Fq "collectVideoUrlCandidates([localUrl,proxyContentUrl,remoteContentUrl" "$DEST"; then
  fail "video generation still prefers local/proxy URLs before the stable remote URL"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
