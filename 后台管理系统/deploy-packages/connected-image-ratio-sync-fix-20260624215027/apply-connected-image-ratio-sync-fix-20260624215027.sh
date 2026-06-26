#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/connected-image-ratio-sync-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/connected-image-ratio-sync-fix-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT

mkdir -p "$WORK_ROOT" "$BACKUP_ROOT"
tar -xzf "$ARCHIVE" -C "$WORK_ROOT"

install_file() {
  local rel="$1"
  local src="$WORK_ROOT/$rel"
  local dst="$APP_ROOT/$rel"
  if [[ ! -f "$src" ]]; then
    echo "missing package file: $rel" >&2
    exit 1
  fi
  if [[ -f "$dst" ]]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
    cp "$dst" "$BACKUP_ROOT/$rel"
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

install_file "workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html"

for file in \
  "$APP_ROOT/workbench-web/image-studio-canvas-next.html" \
  "$APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"; do
  grep -q "function imageSourceRatioLabel" "$file"
  grep -q "_linkedSourceAspectRatio" "$file"
  grep -q "clearLinkedImageSourceSize" "$file"
done

echo "Connected image ratio sync frontend fix deployed."
echo "Backup: $BACKUP_ROOT"
