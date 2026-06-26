#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 2
fi

PKG="canvas-next-asset-confirm-inline-generation-20260616022022"
WORKDIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
TOOLS_SRC="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$SRC" || ! -f "$TOOLS_SRC" ]]; then
  echo "[deploy] missing canvas-next html in archive" >&2
  exit 3
fi

for marker in \
  "function generateAssetConfirmCardImage" \
  "function generateAllAssetConfirmCards" \
  "data-asset-confirm-action=\"generateAll\"" \
  "全部资产生成" \
  "function runAssetConfirmCardMidjourneyAction" \
  "function assetConfirmGeneratedAssetRefs" \
  "asset-confirm-gen-mask"
do
  if ! grep -Fq "$marker" "$SRC"; then
    echo "[deploy] marker missing: $marker" >&2
    exit 4
  fi
done

BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_ROOT"

install_one(){
  local src="$1"
  local dest="$2"
  if [[ -f "$dest" ]]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$dest")"
    cp -a "$dest" "$BACKUP_ROOT/$dest"
  fi
  install -D -m 0644 "$src" "$dest"
  echo "[deploy] installed $dest"
}

install_one "$SRC" "/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
if [[ -d "/home/ubuntu/漫剧创作库/tools/workbench-web" ]]; then
  install_one "$TOOLS_SRC" "/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
fi

echo "[deploy] done"
echo "backup: $BACKUP_ROOT"
