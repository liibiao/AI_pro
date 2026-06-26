#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG="canvas-multigrid-import-ref-chain-fix-20260626220525"
PUBLIC_DIR="${PUBLIC_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 1
fi

WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="/tmp/${PKG}-backup-$(date +%Y%m%d%H%M%S)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/$PKG/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC="$PUBLIC_DIR/image-studio-canvas-next.html"
DST_TOOLS="$MIRROR_DIR/image-studio-canvas-next.html"

verify_file() {
  local file="$1"
  grep -q "function lightweightMultiGridCellImageEntry" "$file"
  grep -q "function ensureMultiGridImportedNodeAssetReady" "$file"
  grep -q "function preserveImportedMultiGridCellRefs" "$file"
}

verify_file "$SRC_PUBLIC"
verify_file "$SRC_TOOLS"

mkdir -p "$BACKUP_DIR/public-workbench" "$BACKUP_DIR/tools-workbench"
if [[ -f "$DST_PUBLIC" ]]; then
  cp -a "$DST_PUBLIC" "$BACKUP_DIR/public-workbench/"
fi
if [[ -f "$DST_TOOLS" ]]; then
  cp -a "$DST_TOOLS" "$BACKUP_DIR/tools-workbench/"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
echo "[deploy] installed $DST_PUBLIC"

if [[ -d "$MIRROR_DIR" ]]; then
  install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"
  echo "[deploy] installed $DST_TOOLS"
else
  echo "[deploy] mirror skipped, not found: $MIRROR_DIR"
fi

verify_file "$DST_PUBLIC"
if [[ -f "$DST_TOOLS" ]]; then
  verify_file "$DST_TOOLS"
fi

STAMP="$(date +%s)"
echo "[deploy] backup: $BACKUP_DIR"
echo "[deploy] hard refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
