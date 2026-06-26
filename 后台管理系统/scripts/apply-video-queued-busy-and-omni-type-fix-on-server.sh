#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/video-queued-busy-and-omni-type-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 video-queued-busy-and-omni-type-fix-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/video-queued-busy-and-omni-type-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/video-queued-busy-and-omni-type-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/workbench-web"

cp -a "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" \
  "$BACKUP_DIR/api-server/src/modules/workbench-compat/routes.ts"
cp -a "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" \
  "$BACKUP_DIR/api-server/dist/modules/workbench-compat/routes.js"
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" \
  "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"

cp -a "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" \
  "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" \
  "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$WORKDIR/api-server/src/modules/workbench-compat/routes.ts" \
  "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
cp -a "$WORKDIR/api-server/dist/modules/workbench-compat/routes.js" \
  "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
cp -a "$WORKDIR/workbench-web/image-studio-canvas-next.html" \
  "$WORKBENCH_ROOT/image-studio-canvas-next.html"

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

grep -q "isFinalFailedTaskStatus" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -q "isQueuedOrBusyTaskMessage" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -q "isFinalSeedanceTaskFailed" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -q "isCompatQueuedOrBusyPayload" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
grep -q "isCompatQueuedOrBusyMessage" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
grep -q "isVideoGenerationAdapterName" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "omni|kling" "$WORKBENCH_ROOT/image-studio-canvas-next.html"

echo "部署完成，备份目录：$BACKUP_DIR"
