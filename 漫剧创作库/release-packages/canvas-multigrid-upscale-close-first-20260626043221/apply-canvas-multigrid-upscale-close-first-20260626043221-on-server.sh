#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-multigrid-upscale-close-first-20260626043221-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

require_marker(){
  local marker="$1"
  local file="$2"
  if ! grep -Fq "$marker" "$file"; then
    echo "缺少部署标记：$marker ($file)" >&2
    exit 1
  fi
}

validate_html(){
  local file="$1"
  test -f "$file"
  require_marker "async function runMultiGridCellUpscaleFromLightbox()" "$file"
  require_marker "finishLightboxClose();" "$file"
  require_marker "const entry=pendingMultiGridCellImageEntry(source);" "$file"
  require_marker "configureMultiGridUpscaleNode(node,state);" "$file"
  require_marker "completeMultiGridUpscaleNodeAsync(newId,source,state);" "$file"
  require_marker "node.values._forceOwnImageRefine=true" "$file"
  require_marker "function scheduleSingleImageConnectionSync(fromId,toId)" "$file"
  require_marker "return multiGridEqualCropRegions(img,rows,cols);" "$file"
}

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

validate_html "$SRC_PUBLIC"
validate_html "$SRC_TOOLS"

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web" \
  "$(dirname "$DST_PUBLIC")" \
  "$(dirname "$DST_TOOLS")"

if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

validate_html "$DST_PUBLIC"
validate_html "$DST_TOOLS"

echo "deployed canvas-multigrid-upscale-close-first-20260626043221"
echo "backup: $BACKUP_DIR"
