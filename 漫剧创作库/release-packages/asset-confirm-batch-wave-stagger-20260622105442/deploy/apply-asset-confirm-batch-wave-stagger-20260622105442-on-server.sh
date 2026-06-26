#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-batch-wave-stagger-20260622105442-${STAMP}"

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
  grep -Fq "const ASSET_CONFIRM_BATCH_START_GAP_MS=3000;" "$file"
  grep -Fq "async function runAssetConfirmBatchWaveQueue" "$file"
  grep -Fq "await Promise.allSettled(tasks);" "$file"
  grep -Fq "const queue=cards.map(card=>card.id);" "$file"
  grep -Fq "await runAssetConfirmBatchWaveQueue(id,queue,{concurrency:ASSET_CONFIRM_BATCH_MAX_CONCURRENCY,startGapMs:ASSET_CONFIRM_BATCH_START_GAP_MS});" "$file"
  if grep -Fq "const mjWorker=async" "$file"; then
    echo "old asset-confirm MJ worker queue still present in $file" >&2
    return 1
  fi
  if grep -Fq "mjConcurrency=Math.min(4" "$file"; then
    echo "old asset-confirm MJ concurrency queue still present in $file" >&2
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

echo "deployed asset-confirm-batch-wave-stagger-20260622105442"
echo "backup: $BACKUP_DIR"
