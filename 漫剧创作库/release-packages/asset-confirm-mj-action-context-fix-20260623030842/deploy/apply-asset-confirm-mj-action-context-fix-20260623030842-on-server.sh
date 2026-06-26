#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-mj-action-context-fix-20260623030842-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"

DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

check_markers(){
  local file="$1"
  test -f "$file"
  grep -Fq "const withSession=list.find(e=>e?.mjSession||e?.saved?.mjSession);" "$file"
  grep -Fq "const baseEntry=ctx.entry||(getPreviewEntriesForNode(n.id)||[])[0]||n.data||{};" "$file"
  grep -Fq "MIDJOURNEY_DETAIL_VIEWER={nodeId:'',entry:null,session:null,pages:[],index:0,sourceEl:null,assetConfirmCardId:''};" "$file"
  grep -Fq "if(!sourceNode||sourceNode!==n){" "$file"
  grep -Fq "replacing:true,replaceExisting:true,isRegeneration:true" "$file"
  grep -Fq "openMidjourneyDetailViewer(previewNode,active.id||Number(active.cellIndex)||1,sourceEl,{entry,entries:[entry],assetConfirmCardId:card.id});" "$file"
  grep -Fq "openMidjourneyDetailViewer(node,active.id||Number(active.cellIndex)||1,sourceEl||findNodeSharedPreviewSource(id,idx),{entry,entries:list,assetConfirmCardId});" "$file"
  grep -Fq "midjourneyTaskItemForContext(n,entry,page)||activeMidjourneyTaskItem" "$file"
}

check_markers "$SRC_PUBLIC"
check_markers "$SRC_TOOLS"

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

check_markers "$DST_PUBLIC"
check_markers "$DST_TOOLS"

echo "deployed asset-confirm-mj-action-context-fix-20260623030842"
echo "backup: $BACKUP_DIR"
