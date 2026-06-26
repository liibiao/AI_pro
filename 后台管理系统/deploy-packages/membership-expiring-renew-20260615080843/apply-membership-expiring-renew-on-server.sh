#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/membership-expiring-renew-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 membership-expiring-renew-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/membership-expiring-renew-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/membership-expiring-renew-$STAMP"

echo "==> 检查目录"
test -d "$REMOTE_APP_ROOT/api-server/src" || { echo "后台源码目录不存在: $REMOTE_APP_ROOT/api-server/src" >&2; exit 1; }
test -d "$REMOTE_APP_ROOT/api-server/dist" || { echo "后台 dist 目录不存在: $REMOTE_APP_ROOT/api-server/dist" >&2; exit 1; }
test -d "$REMOTE_APP_ROOT/admin-web/src" || { echo "后台前端源码目录不存在: $REMOTE_APP_ROOT/admin-web/src" >&2; exit 1; }

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/users" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/users" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"

echo "==> 解包 $PKG"
tar --warning=no-unknown-keyword -xzf "$PKG" -C "$DEPLOY_DIR"
find "$DEPLOY_DIR" -name '._*' -delete 2>/dev/null || true

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/users/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/users/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/users/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/users/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

echo "==> 覆盖用户管理会员到期列表 / 续期接口 / 后台前端"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/users/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/users/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/users/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/users/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/memberships/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/memberships/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/memberships/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
rm -rf "$REMOTE_APP_ROOT/admin-web/dist/assets"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

echo "==> 重启后端 PM2"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
  pm2 save || true
elif id "$PM2_USER" >/dev/null 2>&1 && sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 restart "$PM2_NAME" --update-env
  sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 save || true
else
  echo "当前 PM2 中未找到 $PM2_NAME。请确认服务进程名并手动重启。" >&2
fi

echo "==> 校验关键标记"
grep -q 'membershipExpiringDays' "$REMOTE_APP_ROOT/api-server/dist/modules/users/routes.js"
echo "expiring membership user list route patched: ok"
grep -q 'ADMIN_MEMBERSHIP_RENEW' "$REMOTE_APP_ROOT/api-server/dist/modules/memberships/routes.js"
echo "super admin membership renew route patched: ok"
grep -Rqs '天内到期会员' "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "admin expiring membership tab patched: ok"
grep -Rqs 'RenewMembershipButton' "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
echo "admin renew membership button source patched: ok"

echo "==> 服务健康检查"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo

echo "==> 路由自检（401/403/400 都说明接口已挂载，404 才是不正常）"
HTTP_CODE="$(curl -s -o /tmp/membership-expiring-route-check.json -w '%{http_code}' "http://127.0.0.1/api/users?membershipExpiringDays=3" || true)"
echo "users membershipExpiringDays http=$HTTP_CODE"
if [[ "$HTTP_CODE" == "404" ]]; then
  cat /tmp/membership-expiring-route-check.json || true
  echo "会员到期列表接口仍是 404，请检查 PM2 实际 cwd/script path" >&2
  exit 1
fi

HTTP_CODE="$(curl -s -o /tmp/membership-renew-route-check.json -w '%{http_code}' -X POST "http://127.0.0.1/api/admin/membership/users/route-check/renew" -H 'Content-Type: application/json' -d '{}' || true)"
echo "membership renew http=$HTTP_CODE"
if [[ "$HTTP_CODE" == "404" ]]; then
  cat /tmp/membership-renew-route-check.json || true
  echo "会员续期接口仍是 404，请检查 PM2 实际 cwd/script path" >&2
  exit 1
fi

echo "部署完成。备份目录: $BACKUP_DIR"
