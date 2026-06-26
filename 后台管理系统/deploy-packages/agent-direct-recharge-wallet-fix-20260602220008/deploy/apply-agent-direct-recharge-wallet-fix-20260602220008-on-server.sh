#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/agent-direct-recharge-wallet-fix-20260602220008.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/agent-direct-recharge-wallet-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/agent-direct-recharge-wallet-fix-20260602220008-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }

trap 'rm -rf "$WORKDIR"' EXIT

test -f "$PKG" || { echo "Missing package: $PKG" >&2; exit 1; }
test -d "$REMOTE_APP_ROOT/api-server" || { echo "Missing api-server dir: $REMOTE_APP_ROOT/api-server" >&2; exit 1; }
test -d "$REMOTE_APP_ROOT/admin-web" || { echo "Missing admin-web dir: $REMOTE_APP_ROOT/admin-web" >&2; exit 1; }

log "extract package"
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
SRC="$WORKDIR/ai-admin-platform"
if [ ! -d "$SRC" ]; then
  SRC="$(find "$WORKDIR" -mindepth 2 -maxdepth 2 -type d -name ai-admin-platform | head -1 || true)"
fi
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Package missing ai-admin-platform directory" >&2
  find "$WORKDIR" -maxdepth 3 -type d | sort >&2
  exit 1
fi

log "verify package markers"
grep -Fq "agentDirectRechargeCredits" "$SRC/api-server/src/modules/agent-credit/service.ts"
grep -Fq "AGENT_DIRECT_RECHARGE" "$SRC/api-server/src/modules/agent-credit/service.ts"
grep -Fq "/agent/credit/direct-recharge" "$SRC/api-server/src/modules/agent-credit/routes.ts"
grep -Fq "直接充值积分" "$SRC/admin-web/src/main.tsx"
grep -Fq "客户积分已到账" "$SRC/admin-web/src/main.tsx"
grep -Fq "客户兑换后积分到账" "$SRC/admin-web/src/main.tsx"

log "backup current files: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/service.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit/service.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agent-credit/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/service.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agent-credit/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install patched backend and admin web"
install -m 0644 "$SRC/api-server/src/modules/agent-credit/service.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/service.ts"
install -m 0644 "$SRC/api-server/src/modules/agent-credit/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agent-credit/routes.ts"
install -m 0644 "$SRC/api-server/dist/modules/agent-credit/service.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
install -m 0644 "$SRC/api-server/dist/modules/agent-credit/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js"
install -m 0644 "$SRC/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
cp -a "$SRC/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "verify installed markers"
grep -Fq "agentDirectRechargeCredits" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
grep -Fq "AGENT_DIRECT_RECHARGE" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/service.js"
grep -Fq "/agent/credit/direct-recharge" "$REMOTE_APP_ROOT/api-server/dist/modules/agent-credit/routes.js"
grep -Rqs "直接充值积分" "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
grep -Rqs "客户积分已到账" "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
grep -Rqs "客户兑换后积分到账" "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"

log "restart backend"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

log "healthcheck"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
