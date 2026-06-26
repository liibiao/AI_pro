#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/generation-no-timeout-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 generation-no-timeout-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/generation-no-timeout-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-no-timeout-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/ai-admin-platform/api-server/src" "$BACKUP_DIR/ai-admin-platform/api-server/dist" "$BACKUP_DIR/nginx"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/upstream.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/upstream.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/upstream.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/upstream.js" 2>/dev/null || true

echo "==> 覆盖后端上游请求文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/upstream.ts" "$REMOTE_API_ROOT/api-server/src/upstream.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/upstream.js" "$REMOTE_API_ROOT/api-server/dist/upstream.js"

echo "==> 放宽 Nginx 到后端的生成请求代理超时"
NGINX_CHANGED=0
while IFS= read -r conf; do
  [[ -f "$conf" ]] || continue
  if grep -qE '127\.0\.0\.1:4000|localhost:4000|ai-admin-api' "$conf"; then
    safe_name="$(echo "$conf" | sed 's#/#_#g')"
    cp -a "$conf" "$BACKUP_DIR/nginx/$safe_name" 2>/dev/null || true
    sed -i -E 's/proxy_read_timeout[[:space:]]+[0-9]+[smhd]*;/proxy_read_timeout 3600s;/g' "$conf"
    sed -i -E 's/proxy_send_timeout[[:space:]]+[0-9]+[smhd]*;/proxy_send_timeout 3600s;/g' "$conf"
    NGINX_CHANGED=1
    echo "nginx timeout patched: $conf"
  fi
done < <(find /etc/nginx/sites-enabled /etc/nginx/conf.d -type f 2>/dev/null || true)

if [[ "$NGINX_CHANGED" == "1" ]]; then
  nginx -t
  systemctl reload nginx
else
  echo "未找到匹配的 Nginx 站点配置，跳过 Nginx 修改"
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
grep -q 'fetchWithoutImplicitTimeout' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "node fetch implicit timeout bypass patched: ok"
grep -q 'req.setTimeout(0)' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "node upstream request timeout disabled: ok"
if [[ "$NGINX_CHANGED" == "1" ]]; then
  nginx -T 2>/dev/null | grep -q 'proxy_read_timeout 3600s'
  echo "nginx proxy read timeout patched: ok"
fi

echo "部署完成。备份目录: $BACKUP_DIR"
