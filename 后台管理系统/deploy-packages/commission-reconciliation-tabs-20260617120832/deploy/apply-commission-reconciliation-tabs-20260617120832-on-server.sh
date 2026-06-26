#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/commission-reconciliation-tabs-20260617120832.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/commission-reconciliation-tabs-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/commission-reconciliation-tabs-20260617120832-$STAMP"

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
grep -Fq "会员佣金结算" "$SRC/admin-web/src/main.tsx"
grep -Fq "代理充值积分对账" "$SRC/admin-web/src/main.tsx"
grep -Fq "AgentReconciliationSummary" "$SRC/admin-web/src/main.tsx"
grep -Fq "commissionCustomerText" "$SRC/admin-web/src/main.tsx"
grep -Fq "membershipsById" "$SRC/api-server/src/modules/settlements/routes.ts"
grep -Fq "membershipsById" "$SRC/api-server/src/modules/agents/routes.ts"

log "backup current files: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/settlements" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/settlements" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/settlements/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/settlements/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/settlements/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/settlements/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/agents/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/agents/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install source updates"
install -m 0644 "$SRC/api-server/src/modules/settlements/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/settlements/routes.ts"
install -m 0644 "$SRC/api-server/src/modules/agents/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/agents/routes.ts"
install -m 0644 "$SRC/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"

log "build backend"
cd "$REMOTE_APP_ROOT/api-server"
npm run build

log "build admin web"
cd "$REMOTE_APP_ROOT/admin-web"
npm run build

log "verify installed markers"
grep -Fq "membershipsById" "$REMOTE_APP_ROOT/api-server/dist/modules/settlements/routes.js"
grep -Fq "membershipsById" "$REMOTE_APP_ROOT/api-server/dist/modules/agents/routes.js"
grep -Fq "会员佣金结算" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
grep -Fq "代理充值积分对账" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
grep -Rqs "代理充值积分对账" "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"

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
