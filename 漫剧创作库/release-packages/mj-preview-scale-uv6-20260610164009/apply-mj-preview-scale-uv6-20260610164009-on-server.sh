#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/mj-preview-scale-uv6-20260610164009-${STAMP}"

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
  grep -q "MIDJOURNEY_GRID_ACTION_CREDITS=6" "$file"
  grep -q "billingRule='midjourney-grid-action'" "$file"
  grep -q -- "--canvas-chrome-scale" "$file"
  grep -q "Keep MJ preview chrome usable" "$file"
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

grep -q "MIDJOURNEY_GRID_ACTION_CREDITS=6" "$DST_PUBLIC"
grep -q "billingRule='midjourney-grid-action'" "$DST_PUBLIC"
grep -q -- "--canvas-chrome-scale" "$DST_PUBLIC"
grep -q "Keep MJ preview chrome usable" "$DST_PUBLIC"

echo "deployed mj-preview-scale-uv6-20260610164009"
echo "backup: $BACKUP_DIR"
