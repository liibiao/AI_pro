#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/firefly-admin-direct-preview-20260621200800-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

verify_file(){
  local file="$1"
  test -f "$file"
  grep -Fq "FIREFLY_ADMIN_DETAIL_DIRECT_PREVIEW" "$file"
  grep -Fq "function fireflyDirectPreviewSrc" "$file"
  grep -Fq "const fireflyDirect=fireflyDirectPreviewSrc(input)" "$file"
  grep -Fq "const fireflyDirect=fireflyDirectPreviewSrc(raw)" "$file"
}

verify_file "$SRC_PUBLIC"
verify_file "$SRC_TOOLS"

mkdir -p "$BACKUP_DIR/var-www-ai-admin/workbench-web" "$BACKUP_DIR/home-ubuntu-tools/workbench-web"
if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

verify_file "$DST_PUBLIC"
verify_file "$DST_TOOLS"

echo "deployed firefly-admin-direct-preview-20260621200800"
echo "backup: $BACKUP_DIR"
