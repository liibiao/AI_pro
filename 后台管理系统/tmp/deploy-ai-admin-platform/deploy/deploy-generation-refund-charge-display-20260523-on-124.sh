#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/generation-refund-charge-display-124-20260523.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
pm2_as_user(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  else
    sudo -u "$PM2_USER" pm2 "$@"
  fi
}

log "检查包和目录"
test -f "$PKG" || { echo "包不存在: $PKG" >&2; exit 1; }
test -d "$BACKEND_DIR/admin-web" || { echo "后台目录不正确: $BACKEND_DIR" >&2; exit 1; }

WORKDIR="$(mktemp -d /tmp/generation-refund-charge-display-124-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"

log "覆盖后台管理前端源码和 dist"
cp -R "$WORKDIR/admin-web/." "$BACKEND_DIR/admin-web/"

log "重启后台 PM2"
pm2_as_user restart "$PM2_APP" --update-env || pm2_as_user restart all --update-env || true
pm2_as_user save || true

log "校验关键标记"
grep -n "GenerationChargeDisplay" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -R "实扣" "$BACKEND_DIR/admin-web/dist/assets" | head -3 || true
log "部署完成"
