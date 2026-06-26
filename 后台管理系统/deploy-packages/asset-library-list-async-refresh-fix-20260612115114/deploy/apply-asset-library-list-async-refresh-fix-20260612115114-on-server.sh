#!/usr/bin/env bash
set +H
set -euo pipefail

PKG_NAME="asset-library-list-async-refresh-fix-20260612115114"
ARCHIVE="${1:-/tmp/${PKG_NAME}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG_NAME}-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG_NAME}-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$ARCHIVE" ]] || fail "找不到部署包：$ARCHIVE"
[[ -d "$APP_ROOT/api-server" ]] || fail "找不到 api-server：$APP_ROOT/api-server"

tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation"

install_file() {
  local rel="$1"
  local source="$WORKDIR/$rel"
  local target="$APP_ROOT/$rel"
  [[ -f "$source" ]] || fail "部署包缺少文件：$rel"
  if [[ -f "$target" ]]; then
    cp -a "$target" "$BACKUP_DIR/$rel"
  fi
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
}

install_file "api-server/src/modules/generation/routes.ts"
install_file "api-server/dist/modules/generation/routes.js"

grep -Fq "generationTaskListReadRefreshInFlight" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
grep -Fq "async task" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
grep -Fq "return false;" "$APP_ROOT/api-server/dist/modules/generation/routes.js"

if command -v node >/dev/null 2>&1; then
  node --check "$APP_ROOT/api-server/dist/modules/generation/routes.js"
fi

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  pm2 save >/dev/null 2>&1 || true
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart "$PM2_APP" --update-env
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save >/dev/null 2>&1 || true
else
  fail "没有找到 $PM2_APP PM2 进程"
fi

sleep 2
if curl -fsS --max-time 8 http://127.0.0.1:4000/api/health >/dev/null; then
  log "health ok"
else
  log "health check skipped or failed on 127.0.0.1:4000; external check can still verify"
fi

echo "部署完成，备份目录：$BACKUP_DIR"
