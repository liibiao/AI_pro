#!/usr/bin/env bash
set -euo pipefail

PKG_NAME="veo-task-id-nested-response-fix-20260611034914"
ARCHIVE="${1:-/tmp/${PKG_NAME}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG_NAME}-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG_NAME}-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ ! -f "$ARCHIVE" ]]; then
  echo "找不到部署包：$ARCHIVE" >&2
  exit 1
fi
if [[ ! -d "$APP_ROOT/api-server" ]]; then
  echo "找不到 api-server：$APP_ROOT/api-server" >&2
  exit 1
fi

tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/src" \
  "$BACKUP_DIR/api-server/dist"

install_file() {
  local rel="$1"
  local source="$WORKDIR/$rel"
  local target="$APP_ROOT/$rel"
  if [[ ! -f "$source" ]]; then
    echo "部署包缺少文件：$rel" >&2
    exit 1
  fi
  if [[ -f "$target" ]]; then
    cp -a "$target" "$BACKUP_DIR/$rel"
  fi
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
}

install_file "api-server/src/upstream.ts"
install_file "api-server/dist/upstream.js"
install_file "api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js"

grep -Fq "findNestedVideoTaskId" "$APP_ROOT/api-server/dist/upstream.js"
grep -Fq "SORA_VIDEO_TASK_MISSING" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "extractVideoTask(upstream) || extractUpstreamTaskId(upstream)" \
  "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  pm2 save >/dev/null 2>&1 || true
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart "$PM2_APP" --update-env
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save >/dev/null 2>&1 || true
else
  echo "没有找到 $PM2_APP PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

echo "部署完成，备份目录：$BACKUP_DIR"
