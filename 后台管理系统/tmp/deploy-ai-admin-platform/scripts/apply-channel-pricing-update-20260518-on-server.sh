#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/channel-pricing-update-20260518-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 channel-pricing-update-20260518-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/channel-pricing-update-20260518-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/channel-pricing-update-20260518-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/prisma/migrations" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/prisma/schema.prisma" "$BACKUP_DIR/ai-admin-platform/api-server/prisma/schema.prisma" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits" "$BACKUP_DIR/ai-admin-platform/api-server/prisma/migrations/" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/pricing.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/pricing.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/pricing.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/pricing.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/apply-pricing.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-pricing.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/apply-pricing.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-pricing.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" 2>/dev/null || true

echo "==> 覆盖定价代码和 Prisma schema"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/prisma/schema.prisma" "$REMOTE_APP_ROOT/api-server/prisma/schema.prisma"
mkdir -p "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/prisma/migrations/202605181505_add_membership_bonus_credits/." "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits/"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/pricing.ts" "$REMOTE_APP_ROOT/api-server/src/pricing.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/pricing.js" "$REMOTE_APP_ROOT/api-server/dist/pricing.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/apply-pricing.ts" "$REMOTE_APP_ROOT/api-server/src/apply-pricing.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/apply-pricing.js" "$REMOTE_APP_ROOT/api-server/dist/apply-pricing.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js"

echo "==> 执行数据库迁移并重新生成 Prisma Client"
(cd "$REMOTE_APP_ROOT/api-server" && npm run prisma:deploy && npm run prisma:generate)

echo "==> 应用渠道积分价格到数据库"
(cd "$REMOTE_APP_ROOT/api-server" && node dist/apply-pricing.js)

echo "==> 重启后端"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "当前用户的 PM2 中未找到 ai-admin-api。请切换到运行服务的用户后执行：pm2 restart ai-admin-api --update-env" >&2
fi

echo "==> 校验"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
grep -q 'GEMINI_IMAGE_PRICING_TIERS' "$REMOTE_APP_ROOT/api-server/dist/pricing.js"
echo "gemini image tier pricing code patched: ok"
grep -q 'chargedCreditsPerSecond: 32' "$REMOTE_APP_ROOT/api-server/dist/pricing.js"
echo "sora-v3-pro 32 credits/sec code patched: ok"
grep -q 'chargedCreditsPerSecond: 18' "$REMOTE_APP_ROOT/api-server/dist/pricing.js"
echo "sora-v3-fast 18 credits/sec code patched: ok"
grep -q 'chargedCreditsPerSecond: 6' "$REMOTE_APP_ROOT/api-server/dist/pricing.js"
echo "sora default 6 credits/sec code patched: ok"
grep -q 'soraProVideoModelWhere' "$REMOTE_APP_ROOT/api-server/dist/apply-pricing.js"
echo "pricing database apply route patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
