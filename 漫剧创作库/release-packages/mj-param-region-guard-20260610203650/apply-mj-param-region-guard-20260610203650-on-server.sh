#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/mj-param-region-guard-20260610203650-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
SRC_REGISTRY_TS="$WORKDIR/api-server/src/modules/generation/adapters/registry.ts"
SRC_REGISTRY_JS="$WORKDIR/api-server/dist/modules/generation/adapters/registry.js"

DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
APP_ROOT="${APP_ROOT:-/var/www/ai-admin/ai-admin-platform}"
DST_REGISTRY_TS="$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
DST_REGISTRY_JS="$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  test -f "$file"
  grep -q "function midjourneyVersionCapabilities" "$file"
  grep -q "function stripManagedMidjourneyPromptParams" "$file"
  grep -q "function midjourneyTaskItemForContext" "$file"
  grep -q "mjActions" "$file"
done
for file in "$SRC_REGISTRY_TS" "$SRC_REGISTRY_JS"; do
  test -f "$file"
  grep -q "MIDJOURNEY_MODAL_ACTION_PREPARE_FAILED" "$file"
  grep -q "stripManagedMidjourneyPromptParams" "$file"
  grep -q "normalizeMidjourneyQualityForVersion" "$file"
done

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web" \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters"

if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_REGISTRY_TS" ]; then
  cp "$DST_REGISTRY_TS" "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts"
fi
if [ -f "$DST_REGISTRY_JS" ]; then
  cp "$DST_REGISTRY_JS" "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"
install -m 0644 "$SRC_REGISTRY_TS" "$DST_REGISTRY_TS"
install -m 0644 "$SRC_REGISTRY_JS" "$DST_REGISTRY_JS"

grep -q "function midjourneyVersionCapabilities" "$DST_PUBLIC"
grep -q "function stripManagedMidjourneyPromptParams" "$DST_PUBLIC"
grep -q "function midjourneyTaskItemForContext" "$DST_PUBLIC"
grep -q "mjActions" "$DST_PUBLIC"
grep -q "MIDJOURNEY_MODAL_ACTION_PREPARE_FAILED" "$DST_REGISTRY_JS"
grep -q "stripManagedMidjourneyPromptParams" "$DST_REGISTRY_JS"
grep -q "normalizeMidjourneyQualityForVersion" "$DST_REGISTRY_JS"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "deployed mj-param-region-guard-20260610203650"
echo "backup: $BACKUP_DIR"
