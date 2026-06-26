#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 2
fi

PKG="canvas-next-asset-confirm-upload-404-fix-20260616015034"
WORKDIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$SRC" ]]; then
  echo "[deploy] missing canvas-next html in archive" >&2
  exit 3
fi

for marker in \
  "if(n?.type==='seedanceVideo'||n?.type==='assetConfirm')return 'object_storage'" \
  "loadAndUploadReferenceImage(id,file,entry,{uploadMode:'object_storage'" \
  "const uploadMode=normalizeImageUploadMode(opts.uploadMode||opts.uploadModeOverride||'')" \
  "await uploadReferenceImageForProvider(id,file,img,notifyProgress,uploadMode)" \
  "function assetConfirmUploadLocalReference"
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
  install_one "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
fi

echo "[deploy] done"
echo "backup: $BACKUP_ROOT"
