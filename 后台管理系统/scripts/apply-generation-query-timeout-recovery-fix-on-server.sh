#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/generation-query-timeout-recovery-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 generation-query-timeout-recovery-fix-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/generation-query-timeout-recovery-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-query-timeout-recovery-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation"
tar -xzf "$PKG" -C "$WORKDIR"

cp -a "$APP_ROOT/api-server/src/modules/generation/routes.ts" \
  "$BACKUP_DIR/api-server/src/modules/generation/routes.ts"
cp -a "$APP_ROOT/api-server/dist/modules/generation/routes.js" \
  "$BACKUP_DIR/api-server/dist/modules/generation/routes.js"

cp -a "$WORKDIR/api-server/src/modules/generation/routes.ts" \
  "$APP_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$WORKDIR/api-server/dist/modules/generation/routes.js" \
  "$APP_ROOT/api-server/dist/modules/generation/routes.js"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health
echo
grep -q "GENERATION_QUERY_RETRY_PENDING" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
grep -q "canRecoverRefundedQueryFailure" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
echo "部署完成，备份目录：$BACKUP_DIR"
