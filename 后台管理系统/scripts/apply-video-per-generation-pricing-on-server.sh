#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/video-per-generation-pricing-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 video-per-generation-pricing-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/video-per-generation-pricing-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/video-per-generation-pricing-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"

cp -a "$APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/src/billing.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/billing.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/billing.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/billing.js" 2>/dev/null || true

cp -a "$WORKDIR/ai-admin-platform/admin-web/src/main.tsx" "$APP_ROOT/admin-web/src/main.tsx"
mkdir -p "$APP_ROOT/admin-web/dist"
find "$APP_ROOT/admin-web/dist" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$WORKDIR/ai-admin-platform/admin-web/dist/." "$APP_ROOT/admin-web/dist/"
cp -a "$WORKDIR/ai-admin-platform/api-server/src/billing.ts" "$APP_ROOT/api-server/src/billing.ts"
cp -a "$WORKDIR/ai-admin-platform/api-server/dist/billing.js" "$APP_ROOT/api-server/dist/billing.js"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

grep -q "videoFlatPriceForInput" "$APP_ROOT/api-server/dist/billing.js"
grep -q "chargedCreditsPerGeneration" "$APP_ROOT/api-server/dist/billing.js"
grep -Rqs "按次会员积分/次" "$APP_ROOT/admin-web/dist" "$APP_ROOT/admin-web/src/main.tsx"
grep -Rqs "videoBillingMode" "$APP_ROOT/admin-web/dist" "$APP_ROOT/admin-web/src/main.tsx"

echo "部署完成，备份目录：$BACKUP_DIR"
