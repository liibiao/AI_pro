#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: apply-api-gpt-image-aiyunzhi-routing-fix-20260625100122-on-server.sh <archive.tar.gz>}"
PKG_NAME="api-gpt-image-aiyunzhi-routing-fix-20260625100122"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_DIR="/var/www/ai-admin/backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "[deploy] extract package"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG_NAME/payload/api-server"

test -f "$SRC/src/modules/generation/routes.ts"
test -f "$SRC/dist/modules/generation/routes.js"
test -d "$API_ROOT"

echo "[deploy] backup current api routes -> $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/src/modules/generation" "$BACKUP_DIR/dist/modules/generation"
cp -a "$API_ROOT/src/modules/generation/routes.ts" "$BACKUP_DIR/src/modules/generation/routes.ts"
cp -a "$API_ROOT/dist/modules/generation/routes.js" "$BACKUP_DIR/dist/modules/generation/routes.js"

echo "[deploy] install patched generation routes"
install -m 0644 "$SRC/src/modules/generation/routes.ts" "$API_ROOT/src/modules/generation/routes.ts"
install -m 0644 "$SRC/dist/modules/generation/routes.js" "$API_ROOT/dist/modules/generation/routes.js"
chown ubuntu:ubuntu "$API_ROOT/src/modules/generation/routes.ts" "$API_ROOT/dist/modules/generation/routes.js" || true

echo "[deploy] verify route markers"
grep -Fq "configuredLower === 'openai-image' || configuredLower === 'openai-generations' || configuredLower === 'openai-edits'" "$API_ROOT/src/modules/generation/routes.ts"
grep -Fq "isGptImage2GenerationHint(modelHint, hint, configuredLower)" "$API_ROOT/src/modules/generation/routes.ts"
grep -Fq "hint.includes('aiyunzhi.top') && /seedance|sd2|\\/video\\/generations/.test(hint)" "$API_ROOT/src/modules/generation/routes.ts"
if grep -Fq "|| hint.includes('aiyunzhi.top')) return 'seedance2-sd'" "$API_ROOT/src/modules/generation/routes.ts"; then
  echo "[deploy] stale broad aiyunzhi route rule still present" >&2
  exit 1
fi

echo "[deploy] node syntax check"
node --check "$API_ROOT/dist/modules/generation/routes.js" >/dev/null

echo "[deploy] restart pm2: ai-admin-api"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env >/dev/null
  pm2 status ai-admin-api --no-color | sed -n '1,8p'
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env >/dev/null
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 status ai-admin-api --no-color | sed -n '1,8p'
else
  echo "[deploy] ai-admin-api PM2 process not found" >&2
  exit 1
fi

echo "[deploy] done: ${PKG_NAME}"
