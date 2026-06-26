#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/agent-console-membership-settlement-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR/api-server"
test -d "$BACKEND_DIR/admin-web"

WORKDIR="$(mktemp -d /tmp/agent-console-membership-settlement-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台结算接口"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/settlements/routes.ts" "$BACKEND_DIR/api-server/src/modules/settlements/routes.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/memberships/routes.ts" "$BACKEND_DIR/api-server/src/modules/memberships/routes.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/trial-cards/routes.ts" "$BACKEND_DIR/api-server/src/modules/trial-cards/routes.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/agents/routes.ts" "$BACKEND_DIR/api-server/src/modules/agents/routes.ts"

echo "==> 覆盖后台管理前端"
install -m 0644 "$WORKDIR/admin-web/src/main.tsx" "$BACKEND_DIR/admin-web/src/main.tsx"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 清零会员套餐赠送积分"
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.membershipPlan.updateMany({ data: { bonusCredits: 0 } }).then(r => { console.log(JSON.stringify({ ok: true, clearedMembershipPlans: r.count })); }).finally(() => prisma.\$disconnect());"

echo "==> 编译后台管理前端"
cd "$BACKEND_DIR/admin-web"
npm run build

echo "==> 校验关键标记"
grep -n "申请会员卡资格" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "新增下级代理账号" "$BACKEND_DIR/admin-web/src/main.tsx" || grep -n "一级/初创代理可点击" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "结清该代理全部待结佣金" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "只有初创/一级代理可以自主生成体验卡" "$BACKEND_DIR/api-server/src/modules/trial-cards/routes.ts"
grep -n "SUB_AGENT_USER_NOT_BOUND_TO_PARENT" "$BACKEND_DIR/api-server/src/modules/agents/routes.ts"
grep -n "只能选择已绑定到自己的客户" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "CreateAgentTrialCardsButton" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "bonusCredits: 0" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "bonusCredits: 0" "$BACKEND_DIR/api-server/src/modules/memberships/routes.ts"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：代理工作台会员卡入口、下级代理说明、佣金提前结算能力已更新。"
