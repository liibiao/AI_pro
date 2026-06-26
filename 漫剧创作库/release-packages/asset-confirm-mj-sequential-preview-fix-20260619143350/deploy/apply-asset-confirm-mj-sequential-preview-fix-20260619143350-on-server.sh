#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-mj-sequential-preview-fix-20260619143350-${STAMP}"

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
  grep -Fq "function generateAllAssetConfirmCards" "$file"
  grep -Fq "for(let i=0;i<mjQueue.length;i++)" "$file"
  grep -Fq "saveCanvasAfterMediaResult('资产确认 MJ 批量生图结果')" "$file"
  grep -Fq "function assetConfirmMidjourneyPreviewContextNode" "$file"
  grep -Fq "function assetConfirmScopedMidjourneyPreviewHtml" "$file"
  grep -Fq "data-asset-confirm-mj-preview" "$file"
  grep -Fq "renderMidjourneyPreview(previewNode,[img])" "$file"
  grep -Fq "requestedCardId:taskParams.requestedCardId" "$file"
  if grep -Fq "mjSubmitGapMs" "$file"; then
    echo "old MJ submit-gap batch flow still present in $file" >&2
    exit 1
  fi
  if grep -Fq "submitOnly:true,submittedLabel" "$file"; then
    echo "old submit-only MJ batch flow still present in $file" >&2
    exit 1
  fi
}

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  check_markers "$file"
done

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

echo "deployed asset-confirm-mj-sequential-preview-fix-20260619143350"
echo "backup: $BACKUP_DIR"
