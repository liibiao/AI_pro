#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-mj-failure-ui-action-fix-20260622125552-${STAMP}"

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
  grep -Fq "const ASSET_CONFIRM_BATCH_MJ_MAX_CONCURRENCY=2;" "$file"
  grep -Fq "concurrency:assetConfirmBatchConcurrencyForCards(cards)" "$file"
  grep -Fq "function findFailedAssetConfirmCardForTask" "$file"
  grep -Fq "assetConfirmTaskPromptMatchesCard(card,task,{allowActive:true})" "$file"
  grep -Fq "if(openMidjourneyPreviewForNode(n.id,0,sourceEl))return true;" "$file"
  grep -Fq "async function submitAssetConfirmMidjourneyDetailAction" "$file"
  grep -Fq "await submitAssetConfirmMidjourneyDetailAction(n,n.values.selectedCardId,entry,page,code,customId);" "$file"
  grep -Fq "display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:6px!important" "$file"
  grep -Fq "'ERROR','ERRORED'" "$file"
  grep -Fq "const legacyImage=typeof assetConfirmLegacyImageEntry==='function'?assetConfirmLegacyImageEntry(card):null;" "$file"
  if grep -Fq "const legacyImage=assetConfirmLegacyImageEntry(card);" "$file"; then
    echo "stale legacyImage scope bug marker found in $file" >&2
    return 1
  fi
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

echo "deployed asset-confirm-mj-failure-ui-action-fix-20260622125552"
echo "backup: $BACKUP_DIR"
