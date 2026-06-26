#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/mj-toolbar-tips-q4-20260610133317-${STAMP}"

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
  grep -q "midjourneyQualityOptionsForVersion" "$file"
  grep -q "Q 4" "$file"
  grep -q "Q4 仅 V7/Niji7" "$file"
  grep -q "选择一套现成的 MJ 风格" "$file"
  grep -q "选择画面宽高比例" "$file"
  grep -q "选择图片清晰度" "$file"
  grep -q "选择出图速度" "$file"
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

grep -q "midjourneyQualityOptionsForVersion" "$DST_PUBLIC"
grep -q "Q 4" "$DST_PUBLIC"
grep -q "Q4 仅 V7/Niji7" "$DST_PUBLIC"
grep -q "选择一套现成的 MJ 风格" "$DST_PUBLIC"
grep -q "选择画面宽高比例" "$DST_PUBLIC"
grep -q "选择图片清晰度" "$DST_PUBLIC"
grep -q "选择出图速度" "$DST_PUBLIC"

echo "deployed mj-toolbar-tips-q4-20260610133317"
echo "backup: $BACKUP_DIR"
