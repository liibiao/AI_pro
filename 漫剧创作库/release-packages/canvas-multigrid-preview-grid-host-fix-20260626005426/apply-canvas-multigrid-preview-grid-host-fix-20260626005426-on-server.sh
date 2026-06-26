#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-multigrid-preview-grid-host-fix-20260626005426-${STAMP}"

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

reject_marker(){
  local marker="$1"
  local file="$2"
  if grep -Fq "$marker" "$file"; then
    echo "发现应移除的旧逻辑：$marker ($file)" >&2
    exit 1
  fi
}

validate_html(){
  local file="$1"
  test -f "$file"
  require_marker ".aio-preview.multi-grid-preview-host" "$file"
  require_marker ".multi-grid-preview-grid{width:100%;height:100%" "$file"
  require_marker "function multiGridPreviewGroupMeta(entries)" "$file"
  require_marker "function renderMultiGridPreviewGrid(entries,nodeId" "$file"
  require_marker "const upGridHtml=renderMultiGridPreviewGrid" "$file"
  require_marker "const multiGridPreviewHtml=!mjPreview&&!concurrent&&hasResult?renderMultiGridPreviewGrid" "$file"
  require_marker "object-fit:cover!important;border-radius:0!important" "$file"
  require_marker "function multiGridCropRegionsFromImage(img,rows,cols)" "$file"
  require_marker "不要生成2x2或四宫格" "$file"
  reject_marker "function analyzeMultiGridCropLayout" "$file"
  reject_marker "function detectMultiGridDividerBands" "$file"
  reject_marker "multiGridSkipExpand" "$file"
  reject_marker "application/x-mjb-grid-cell" "$file"
  reject_marker "data-grid-cell-drag" "$file"
  reject_marker "createSingleImageNodeFromMultiGridDrop" "$file"
  reject_marker "bindMultiGridCellDragGlobal" "$file"
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

echo "deployed canvas-multigrid-preview-grid-host-fix-20260626005426"
echo "backup: $BACKUP_DIR"
