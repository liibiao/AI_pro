#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/agent-membership-card-gate-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 agent-membership-card-gate-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/agent-membership-card-gate-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/agent-membership-card-gate-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/trial-cards" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/trial-cards" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/trial-cards/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/trial-cards/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/trial-cards/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/trial-cards/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/pricing.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/pricing.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

echo "==> 覆盖后端和后台管理前端"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/agents/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/agents/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/trial-cards/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/trial-cards/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/trial-cards/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/trial-cards/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/pricing.ts" "$REMOTE_APP_ROOT/api-server/src/pricing.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

echo "==> 修正 0 元月度会员套餐价格为 29 元"
if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -c "UPDATE membership_plans SET price=2900 WHERE price=0 AND (id='seed-monthly-plan' OR name LIKE '%月%会员%' OR name LIKE '%月度会员%');" || true
elif [[ -f "$REMOTE_APP_ROOT/api-server/.env" ]] && command -v psql >/dev/null 2>&1; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$REMOTE_APP_ROOT/api-server/.env" | tail -1 | cut -d= -f2- | sed 's/^\"//;s/\"$//')"
  if [[ -n "$DB_URL" ]]; then
    psql "$DB_URL" -c "UPDATE membership_plans SET price=2900 WHERE price=0 AND (id='seed-monthly-plan' OR name LIKE '%月%会员%' OR name LIKE '%月度会员%');" || true
  else
    echo "未找到 DATABASE_URL，跳过会员套餐价格修正"
  fi
else
  echo "未找到 psql 或 DATABASE_URL，跳过会员套餐价格修正"
fi

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
grep -q 'AGENT_MEMBERSHIP_CARD_STOCK_LOW' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "agent membership card stock gate patched: ok"
grep -q 'agent-membership/cards/grant' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "admin membership card grant route patched: ok"
grep -q 'membership-card-requests' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "agent membership card request route patched: ok"
grep -q 'sub-agent-membership/cards/grant' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "sub-agent membership card grant route patched: ok"
grep -q 'monthlyBetaPriceCredits: 2900' "$REMOTE_APP_ROOT/api-server/src/pricing.ts"
echo "membership monthly default price patched: ok"
grep -q 'AGENT_MEMBER_ACCOUNT_CLAIM_DISABLED' "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js"
echo "free member account claim disabled: ok"
grep -q 'AGENT_TRIAL_CARD_CREATE_DISABLED' "$REMOTE_APP_ROOT/api-server/dist/modules/trial-cards/routes.js"
echo "free trial card generation disabled: ok"
grep -Rqs '给代理配会员卡' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "admin membership card grant ui patched: ok"
grep -Rqs '申请会员卡资格' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "agent membership card request ui patched: ok"
grep -Rqs '给下级配会员卡' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "sub-agent membership card grant ui patched: ok"
grep -Rqs 'membershipCardAmountYuan' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "membership card amount auto calculation patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
