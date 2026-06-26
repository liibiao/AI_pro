#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-derive-progress-full-preview-20260623021402-${STAMP}"

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
  grep -Fq "if(n?.type==='textPrompt'&&isAssetCardDeriving(n))return '';" "$file"
  grep -Fq "prompt-runtime-feed asset-card-derive-steps" "$file"
  grep -Fq "asset-card-derive-thinking" "$file"
  grep -Fq 'data-asset-card-derive-progress>${renderAssetCardDeriveStepRows(n)}</div>' "$file"
  grep -Fq ".node.node-type-textPrompt .aio-preview>.asset-card-derive-progress .asset-card-derive-progress-inner" "$file"
  grep -Fq "display:none!important;" "$file"
  grep -Fq "height:100%!important;" "$file"
  grep -Fq "max-height:none!important;" "$file"
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

echo "deployed asset-derive-progress-full-preview-20260623021402"
echo "backup: $BACKUP_DIR"
