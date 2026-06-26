#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
PKG_NAME="mj-detail-cell-ratio-fix-20260610042501"
TMP_DIR="$(mktemp -d /tmp/${PKG_NAME}.XXXXXX)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"

cleanup(){
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

SRC_PUBLIC="$TMP_DIR/$PKG_NAME/workbench-web/image-studio-canvas-next.html"
SRC_REPO="$TMP_DIR/$PKG_NAME/tools/workbench-web/image-studio-canvas-next.html"
PUBLIC_TARGET="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
REPO_TARGET="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

echo "[deploy] verify package markers"
for marker in \
  "function normalizeMidjourneyAspectRatio(value)" \
  "function midjourneyAspectRatioFromContext(n,entries=[])" \
  "aspectRatio:grid.aspectRatio||grid.requestedRatio" \
  "const ratio=normalizeMidjourneyAspectRatio(page?.aspectRatio||page?.requestedRatio||page?.ratio)" \
  "entry.requestedRatio=aspectRatio||entry.requestedRatio||''"; do
  grep -Fq "$marker" "$SRC_PUBLIC"
  grep -Fq "$marker" "$SRC_REPO"
done

install -d "$(dirname "$PUBLIC_TARGET")" "$(dirname "$REPO_TARGET")"
if [ -f "$PUBLIC_TARGET" ]; then cp -a "$PUBLIC_TARGET" "$BACKUP_DIR/image-studio-canvas-next.public.html"; fi
if [ -f "$REPO_TARGET" ]; then cp -a "$REPO_TARGET" "$BACKUP_DIR/image-studio-canvas-next.repo.html"; fi

install -m 0644 "$SRC_PUBLIC" "$PUBLIC_TARGET"
install -m 0644 "$SRC_REPO" "$REPO_TARGET"

echo "[deploy] verify installed markers"
for marker in \
  "function normalizeMidjourneyAspectRatio(value)" \
  "function midjourneyAspectRatioFromContext(n,entries=[])" \
  "aspectRatio:grid.aspectRatio||grid.requestedRatio" \
  "const ratio=normalizeMidjourneyAspectRatio(page?.aspectRatio||page?.requestedRatio||page?.ratio)" \
  "entry.requestedRatio=aspectRatio||entry.requestedRatio||''"; do
  grep -Fq "$marker" "$PUBLIC_TARGET"
  grep -Fq "$marker" "$REPO_TARGET"
done

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=20260610042501"
