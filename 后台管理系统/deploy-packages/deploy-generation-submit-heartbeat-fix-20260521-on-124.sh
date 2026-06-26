#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/generation-submit-heartbeat-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"

WORK="$(mktemp -d /tmp/generation-submit-heartbeat-fix-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

log "解压部署包"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORK"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台 generation 路由"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"

log "编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

log "校验同步提交心跳与等待保护"
grep -n "startGenerationSubmitHeartbeat" "$BACKEND_DIR/api-server/src/modules/generation/routes.ts"
grep -n "isFreshGenerationSubmit" "$BACKEND_DIR/api-server/src/modules/generation/routes.ts"
grep -n "generation-submit" "$BACKEND_DIR/api-server/dist/modules/generation/routes.js"

log "重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

log "部署完成：同步生图提交期间会续租任务，避免后台回收器把仍在等待的任务误判为中断。"
