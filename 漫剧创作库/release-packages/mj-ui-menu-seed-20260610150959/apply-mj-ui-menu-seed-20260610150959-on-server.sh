#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/mj-ui-menu-seed-20260610150959-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  test -f "$file"
  grep -q "mj-floating-tip" "$file"
  grep -q "data-mj-page-action-trigger" "$file"
  grep -q "mj-page-action-popover" "$file"
  grep -q "const seed=String(task?.seed" "$file"
  grep -q '<div class="mj-detail-k">Seed' "$file"
  grep -q "const shouldCrop=" "$file"
  grep -q "23.4px" "$file"
  grep -q "gap:3px" "$file"
  grep -q "midjourneyQualityOptionsForVersion" "$file"
  grep -q "Q 4" "$file"
done

mkdir -p "$BACKUP_DIR/var-www-ai-admin/workbench-web" "$BACKUP_DIR/home-ubuntu-tools/workbench-web"
if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

for file in "$DST_PUBLIC" "$DST_TOOLS"; do
  grep -q "mj-floating-tip" "$file"
  grep -q "data-mj-page-action-trigger" "$file"
  grep -q "mj-page-action-popover" "$file"
  grep -q "const seed=String(task?.seed" "$file"
  grep -q '<div class="mj-detail-k">Seed' "$file"
  grep -q "const shouldCrop=" "$file"
  grep -q "23.4px" "$file"
  grep -q "gap:3px" "$file"
  grep -q "midjourneyQualityOptionsForVersion" "$file"
  grep -q "Q 4" "$file"
done

echo "deployed mj-ui-menu-seed-20260610150959"
echo "backup: $BACKUP_DIR"
