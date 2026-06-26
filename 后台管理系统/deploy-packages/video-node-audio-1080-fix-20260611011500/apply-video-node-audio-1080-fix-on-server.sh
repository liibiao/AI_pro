#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
ROOT="/var/www/ai-admin"
TMP="/tmp/video-node-audio-1080-fix-$$"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="$ROOT/backups/video-node-audio-1080-fix-20260611011500-$STAMP"

echo "[deploy] extract $ARCHIVE"
rm -rf "$TMP"
mkdir -p "$TMP" "$BACKUP"
tar -xzf "$ARCHIVE" -C "$TMP"

SRC="$TMP/tools/workbench-web/image-studio-canvas-next.html"
test -s "$SRC"

echo "[deploy] backup: $BACKUP"
mkdir -p "$BACKUP/root" "$BACKUP/workbench-web" "$BACKUP/tools/workbench-web" "/home/ubuntu/漫剧创作库/tools/workbench-web"
cp -p "$ROOT/image-studio-canvas-next.html" "$BACKUP/root/image-studio-canvas-next.html" 2>/dev/null || true
cp -p "$ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -p "$ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "[deploy] install canvas"
install -m 0644 "$SRC" "$ROOT/image-studio-canvas-next.html"
install -m 0644 "$SRC" "$ROOT/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$SRC" "$ROOT/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$SRC" "/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

echo "[deploy] verify markers"
grep -F "!isOfficialSd2VideoModel(model)&&resolutions.includes('1080p')" "$ROOT/image-studio-canvas-next.html" >/dev/null
grep -F "function getAudioFallbackUrls" "$ROOT/image-studio-canvas-next.html" >/dev/null
grep -F "syncUpstreamMediaToVideo(n);" "$ROOT/image-studio-canvas-next.html" >/dev/null
grep -F "pickedType==='audio'?audioUrlFromPayload(picked):videoUrlFromPayload(picked)" "$ROOT/image-studio-canvas-next.html" >/dev/null

echo "[deploy] done"
echo "backup: $BACKUP"
