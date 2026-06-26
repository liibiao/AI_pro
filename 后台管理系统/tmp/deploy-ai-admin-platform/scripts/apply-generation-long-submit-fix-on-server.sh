#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/generation-long-submit-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 generation-long-submit-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/generation-long-submit-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-long-submit-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/upstream.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/upstream.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/upstream.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/upstream.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

echo "==> 覆盖后端生成链路文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/upstream.ts" "$REMOTE_API_ROOT/api-server/src/upstream.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/upstream.js" "$REMOTE_API_ROOT/api-server/dist/upstream.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"

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
grep -q 'options.timeoutMs === 0' "$REMOTE_API_ROOT/api-server/dist/upstream.js"
echo "long generation post retry suppression patched: ok"
grep -q 'queryGenericImage' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "image async status query patched: ok"
grep -q 'submitRunningImageTaskFromTransientError' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "transient submit task-id recovery patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
