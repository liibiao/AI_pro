#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive missing: $ARCHIVE" >&2
  exit 1
fi

STAMP="20260613095534"
PKG="mj-preview-click-detail-fix-${STAMP}"
TMP="/tmp/${PKG}-extract"
WEB_TARGET="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
MIRROR_TARGET="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-$(date +%Y%m%d%H%M%S)"

rm -rf "$TMP"
mkdir -p "$TMP"
tar -xzf "$ARCHIVE" -C "$TMP"

SRC_WEB="$TMP/${PKG}/workbench-web/image-studio-canvas-next.html"
SRC_MIRROR="$TMP/${PKG}/tools/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$SRC_WEB" || ! -f "$SRC_MIRROR" ]]; then
  echo "[deploy] package files missing" >&2
  exit 1
fi

echo "[deploy] verify package markers"
for marker in \
  "mj-page-open-target" \
  "resetMidjourneyActionModeAfterPreview" \
  "[data-mj-page-action-menu],.mj-grid-actions,.mj-detail-actions,.mj-detail-action-groups" \
  "n.values.mjTaskKind='imagine';"; do
  if ! grep -Fq "$marker" "$SRC_WEB"; then
    echo "[deploy] missing marker: $marker" >&2
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR"
if [[ -f "$WEB_TARGET" ]]; then
  cp -p "$WEB_TARGET" "$BACKUP_DIR/image-studio-canvas-next.html.var-www.bak"
fi
if [[ -f "$MIRROR_TARGET" ]]; then
  cp -p "$MIRROR_TARGET" "$BACKUP_DIR/image-studio-canvas-next.html.repo.bak"
fi

install -m 0644 "$SRC_WEB" "$WEB_TARGET"
install -m 0644 "$SRC_MIRROR" "$MIRROR_TARGET"

echo "[deploy] verify installed markers"
for target in "$WEB_TARGET" "$MIRROR_TARGET"; do
  for marker in \
    "mj-page-open-target" \
    "resetMidjourneyActionModeAfterPreview" \
    "[data-mj-page-action-menu],.mj-grid-actions,.mj-detail-actions,.mj-detail-action-groups" \
    "n.values.mjTaskKind='imagine';"; do
    if ! grep -Fq "$marker" "$target"; then
      echo "[deploy] installed marker missing in $target: $marker" >&2
      exit 1
    fi
  done
done

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=${STAMP}"
