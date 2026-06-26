#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/founder-agent-team-credit-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 founder-agent-team-credit-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/founder-agent-team-credit-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/founder-agent-team-credit-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/service.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit/service.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/service.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

echo "==> 覆盖后端和后台管理前端"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/agent-credit/service.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/service.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/agent-credit/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/service.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/agents/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/agents/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

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
grep -q 'grantSubAgentCredits' "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
echo "founder sub-agent credit grant patched: ok"
grep -q 'sub-agent-credit/grants' "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js"
echo "sub-agent grant route patched: ok"
grep -q 'isAgentDescendantOf' "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
echo "team customer voucher permission patched: ok"
grep -q 'getVisibleCustomerAgentIds' "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js"
echo "founder team customer list patched: ok"
grep -Rqs '给线下代理配额' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "admin agent team credit ui patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
