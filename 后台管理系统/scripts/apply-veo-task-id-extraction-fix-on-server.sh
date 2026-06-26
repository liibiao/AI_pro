#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/veo-task-id-extraction-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 veo-task-id-extraction-fix-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/veo-task-id-extraction-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/veo-task-id-extraction-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"

cp -a "$APP_ROOT/api-server/src/upstream.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/upstream.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/upstream.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/upstream.js" 2>/dev/null || true

cp -a "$WORKDIR/ai-admin-platform/api-server/src/upstream.ts" "$APP_ROOT/api-server/src/upstream.ts"
cp -a "$WORKDIR/ai-admin-platform/api-server/dist/upstream.js" "$APP_ROOT/api-server/dist/upstream.js"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

grep -q "firstTaskIdCandidate" "$APP_ROOT/api-server/dist/upstream.js"
grep -q "operation?.name" "$APP_ROOT/api-server/dist/upstream.js"
grep -q "response?.id" "$APP_ROOT/api-server/dist/upstream.js"
grep -q "response?.name" "$APP_ROOT/api-server/dist/upstream.js"

echo "部署完成，备份目录：$BACKUP_DIR"
