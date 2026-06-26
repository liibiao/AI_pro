#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
NAME="canvas-visible-preview-sync-fix-20260624201744"
APP_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_ROOT="/var/www/ai-admin/workbench-web"
TOOLS_ROOT="$APP_ROOT/tools/workbench-web"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d "/tmp/${NAME}.XXXXXX")"
BACKUP_DIR="$APP_ROOT/.deploy-backups/${NAME}-${STAMP}"

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

require_file(){
  [[ -f "$1" ]] || { echo "missing file: $1" >&2; exit 1; }
}

require_marker(){
  local file="$1" marker="$2"
  grep -q "$marker" "$file" || { echo "missing marker '$marker' in $file" >&2; exit 1; }
}

for root in workbench-web tools/workbench-web; do
  require_file "$WORKDIR/$root/image-studio-canvas-next.html"
  require_file "$WORKDIR/$root/canvas-next/app.js"
  require_file "$WORKDIR/$root/canvas-next/state.js"
  require_file "$WORKDIR/$root/canvas-next/generation-service.js"
  require_file "$WORKDIR/$root/canvas-next/renderers.js"
  require_marker "$WORKDIR/$root/image-studio-canvas-next.html" "syncVisibleImagePreviewConnections"
  require_marker "$WORKDIR/$root/image-studio-canvas-next.html" "scheduleVisibleImagePreviewConnectionSync"
  require_marker "$WORKDIR/$root/image-studio-canvas-next.html" "imageNodeHasVisibleRenderedImage"
  require_marker "$WORKDIR/$root/image-studio-canvas-next.html" "imageEntriesFromVisiblePreviewNode"
  require_marker "$WORKDIR/$root/image-studio-canvas-next.html" "scheduleVisibleImagePreviewConnectionSync();"
done

mkdir -p "$BACKUP_DIR/public/canvas-next" "$BACKUP_DIR/tools/canvas-next"
for file in image-studio-canvas-next.html; do
  [[ -f "$PUBLIC_ROOT/$file" ]] && cp -p "$PUBLIC_ROOT/$file" "$BACKUP_DIR/public/$file"
  [[ -f "$TOOLS_ROOT/$file" ]] && cp -p "$TOOLS_ROOT/$file" "$BACKUP_DIR/tools/$file"
done
for file in app.js state.js generation-service.js renderers.js; do
  [[ -f "$PUBLIC_ROOT/canvas-next/$file" ]] && cp -p "$PUBLIC_ROOT/canvas-next/$file" "$BACKUP_DIR/public/canvas-next/$file"
  [[ -f "$TOOLS_ROOT/canvas-next/$file" ]] && cp -p "$TOOLS_ROOT/canvas-next/$file" "$BACKUP_DIR/tools/canvas-next/$file"
done

install -d "$PUBLIC_ROOT/canvas-next" "$TOOLS_ROOT/canvas-next"
install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/app.js" "$PUBLIC_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/state.js" "$PUBLIC_ROOT/canvas-next/state.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/generation-service.js" "$PUBLIC_ROOT/canvas-next/generation-service.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/renderers.js" "$PUBLIC_ROOT/canvas-next/renderers.js"

install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/app.js" "$TOOLS_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/state.js" "$TOOLS_ROOT/canvas-next/state.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/generation-service.js" "$TOOLS_ROOT/canvas-next/generation-service.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$TOOLS_ROOT/canvas-next/renderers.js"

for root in "$PUBLIC_ROOT" "$TOOLS_ROOT"; do
  require_marker "$root/image-studio-canvas-next.html" "syncVisibleImagePreviewConnections"
  require_marker "$root/image-studio-canvas-next.html" "scheduleVisibleImagePreviewConnectionSync"
  require_marker "$root/image-studio-canvas-next.html" "imageNodeHasVisibleRenderedImage"
  require_marker "$root/image-studio-canvas-next.html" "imageEntriesFromVisiblePreviewNode"
  require_marker "$root/image-studio-canvas-next.html" "scheduleVisibleImagePreviewConnectionSync();"
done

echo "deployed $NAME"
echo "backup: $BACKUP_DIR"
echo "canvas: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
