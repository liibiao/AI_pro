#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: sudo BACKEND_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/admin-membership-pagination-recharge-20260523.tar.gz"
  exit 1
fi

BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
WORK_DIR="/tmp/admin-membership-pagination-recharge-$(date +%Y%m%d%H%M%S)"

echo "==> 检查目录"
test -d "$BACKEND_DIR/api-server/src" || { echo "后台源码目录不存在: $BACKEND_DIR/api-server/src"; exit 1; }
test -d "$BACKEND_DIR/admin-web/src" || { echo "后台前端源码目录不存在: $BACKEND_DIR/admin-web/src"; exit 1; }

echo "==> 解包 $PKG"
mkdir -p "$WORK_DIR"
tar -xzf "$PKG" -C "$WORK_DIR"
find "$WORK_DIR" -name '._*' -delete 2>/dev/null || true

echo "==> 覆盖后台会员批量开通 / 钱包直充接口"
cp "$WORK_DIR/api-server/src/modules/memberships/routes.ts" "$BACKEND_DIR/api-server/src/modules/memberships/routes.ts"
cp "$WORK_DIR/api-server/src/modules/wallets/routes.ts" "$BACKEND_DIR/api-server/src/modules/wallets/routes.ts"

echo "==> 覆盖后台管理前端用户管理 UI"
cp "$WORK_DIR/admin-web/src/main.tsx" "$BACKEND_DIR/admin-web/src/main.tsx"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 编译后台管理前端"
cd "$BACKEND_DIR/admin-web"
npm run build

echo "==> 校验关键标记"
grep -n "allNonMember" "$BACKEND_DIR/api-server/dist/modules/memberships/routes.js"
grep -n "direct-recharge" "$BACKEND_DIR/api-server/dist/modules/wallets/routes.js"
grep -n "当前筛选下全部非会员用户" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "DirectRechargeButton" "$BACKEND_DIR/admin-web/src/main.tsx"

echo "==> 重启后台 PM2"
if id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env"
  sudo -u "$PM2_USER" bash -lc "pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "==> 路由自检（401/403/400 都说明接口已挂载，404 才是不正常）"
HTTP_CODE="$(curl -s -o /tmp/admin-membership-route-check.json -w '%{http_code}' -X POST "http://127.0.0.1/api/admin/membership/batch-direct-open" -H 'Content-Type: application/json' -d '{}' || true)"
echo "batch-direct-open http=$HTTP_CODE"
if [[ "$HTTP_CODE" == "404" ]]; then
  cat /tmp/admin-membership-route-check.json || true
  echo "批量开通会员接口仍是 404，请检查 PM2 实际 cwd/script path"
  exit 1
fi

HTTP_CODE="$(curl -s -o /tmp/admin-direct-recharge-route-check.json -w '%{http_code}' -X POST "http://127.0.0.1/api/wallets/route-check/direct-recharge" -H 'Content-Type: application/json' -d '{}' || true)"
echo "direct-recharge http=$HTTP_CODE"
if [[ "$HTTP_CODE" == "404" ]]; then
  cat /tmp/admin-direct-recharge-route-check.json || true
  echo "直接充值接口仍是 404，请检查 PM2 实际 cwd/script path"
  exit 1
fi

echo "部署完成：用户管理已支持服务端分页、跨页全部非会员批量开通、超级管理员直接充值积分。"
