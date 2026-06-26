#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/generation-query-fail-refund-no-retry-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 generation-query-fail-refund-no-retry-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/generation-query-fail-refund-no-retry-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-query-fail-refund-no-retry-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

require_marker() {
  local marker="$1"
  local file="$2"
  if ! grep -q "$marker" "$file"; then
    echo "缺少部署标记：$marker ($file)" >&2
    exit 1
  fi
}

reject_marker() {
  local marker="$1"
  local file="$2"
  if grep -q "$marker" "$file"; then
    echo "发现不应存在的旧标记：$marker ($file)" >&2
    exit 1
  fi
}

validate_generation_routes() {
  local file="$1"
  require_marker "任务已自动关闭并退款" "$file"
  require_marker "GENERATION_QUERY_FAILED" "$file"
  require_marker "canRecoverRefundedQueryFailure" "$file"
  reject_marker "GENERATION_QUERY_RETRY_PENDING" "$file"
  reject_marker "上游任务状态暂时无法查询" "$file"
  reject_marker "transientQueryFailure" "$file"
}

mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation"
tar -xzf "$PKG" -C "$WORKDIR"

validate_generation_routes "$WORKDIR/api-server/src/modules/generation/routes.ts"
validate_generation_routes "$WORKDIR/api-server/dist/modules/generation/routes.js"

cp -a "$APP_ROOT/api-server/src/modules/generation/routes.ts" \
  "$BACKUP_DIR/api-server/src/modules/generation/routes.ts"
cp -a "$APP_ROOT/api-server/dist/modules/generation/routes.js" \
  "$BACKUP_DIR/api-server/dist/modules/generation/routes.js"

cp -a "$WORKDIR/api-server/src/modules/generation/routes.ts" \
  "$APP_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$WORKDIR/api-server/dist/modules/generation/routes.js" \
  "$APP_ROOT/api-server/dist/modules/generation/routes.js"

validate_generation_routes "$APP_ROOT/api-server/src/modules/generation/routes.ts"
validate_generation_routes "$APP_ROOT/api-server/dist/modules/generation/routes.js"

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
echo "部署完成，备份目录：$BACKUP_DIR"
