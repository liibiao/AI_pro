#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/membership-plan-bonus-credits-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 membership-plan-bonus-credits-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/membership-plan-bonus-credits-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/membership-plan-bonus-credits-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/prisma/migrations" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/prisma/schema.prisma" "$BACKUP_DIR/ai-admin-platform/api-server/prisma/schema.prisma" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits" "$BACKUP_DIR/ai-admin-platform/api-server/prisma/migrations/" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/seed.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/seed.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/seed.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/seed.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/apply-pricing.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-pricing.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/apply-pricing.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-pricing.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

echo "==> 覆盖后端、Prisma 和后台管理前端"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/prisma/schema.prisma" "$REMOTE_APP_ROOT/api-server/prisma/schema.prisma"
mkdir -p "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/prisma/migrations/202605181505_add_membership_bonus_credits/." "$REMOTE_APP_ROOT/api-server/prisma/migrations/202605181505_add_membership_bonus_credits/"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/seed.ts" "$REMOTE_APP_ROOT/api-server/src/seed.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/seed.js" "$REMOTE_APP_ROOT/api-server/dist/seed.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/apply-pricing.ts" "$REMOTE_APP_ROOT/api-server/src/apply-pricing.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/apply-pricing.js" "$REMOTE_APP_ROOT/api-server/dist/apply-pricing.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
find "$REMOTE_APP_ROOT/admin-web/dist" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

echo "==> 执行数据库迁移并重新生成 Prisma Client"
(cd "$REMOTE_APP_ROOT/api-server" && npm run prisma:deploy && npm run prisma:generate)

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
grep -q 'bonus_credits' "$REMOTE_APP_ROOT/api-server/prisma/schema.prisma"
echo "membership plan bonus credits schema patched: ok"
grep -q 'MEMBERSHIP_BONUS' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "membership bonus wallet ledger patched: ok"
grep -q 'bonusCredits: 0' "$REMOTE_APP_ROOT/api-server/dist/seed.js"
echo "membership seed default bonus zero patched: ok"
grep -Rqs '会员套餐积分' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "membership plan bonus credits ui patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
