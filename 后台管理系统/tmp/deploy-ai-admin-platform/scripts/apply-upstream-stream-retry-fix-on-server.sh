#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/upstream-stream-retry-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 upstream-stream-retry-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/upstream-stream-retry-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/upstream-stream-retry-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/ai-admin-platform/api-server/src" "$BACKUP_DIR/ai-admin-platform/api-server/dist"
cp -a "$REMOTE_API_ROOT/api-server/src/upstream.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/upstream.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/upstream.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/upstream.js" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/upstream.ts" "$REMOTE_API_ROOT/api-server/src/upstream.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/upstream.js" "$REMOTE_API_ROOT/api-server/dist/upstream.js"

echo "==> 重启后端"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
else
  echo "当前用户的 PM2 中未找到 ai-admin-api。请切换到运行服务的用户后执行：pm2 restart ai-admin-api --update-env" >&2
fi

echo "==> 校验"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
grep -q 'isRetryableUpstreamHttpError' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "upstream http retry classifier patched: ok"
grep -q 'stream disconnected' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "stream disconnected retry patched: ok"
grep -q 'upstreamHttpAttempts' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "upstream retry attempts patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
