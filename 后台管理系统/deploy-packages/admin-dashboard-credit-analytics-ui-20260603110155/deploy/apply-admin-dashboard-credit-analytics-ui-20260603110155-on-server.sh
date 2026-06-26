#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/admin-dashboard-credit-analytics-ui-20260603110155.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/admin-dashboard-credit-analytics-ui-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/admin-dashboard-credit-analytics-ui-20260603110155-$STAMP"

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
grep -Fq "creditSummary" "$SRC/api-server/src/modules/admin-logs/routes.ts"
grep -Fq "walletPeriodBucketSql" "$SRC/api-server/src/modules/admin-logs/routes.ts"
grep -Fq "DashboardBarChart" "$SRC/admin-web/src/main.tsx"
grep -Fq "过滤超级管理员给自己充值" "$SRC/admin-web/src/main.tsx"
grep -Fq ".dashboardMetricGrid" "$SRC/admin-web/src/styles.css"
grep -Rqs "积分构成" "$SRC/admin-web/dist" "$SRC/admin-web/src/main.tsx"

log "backup current files: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/admin-logs" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/admin-logs" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/admin-logs/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/admin-logs/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/admin-logs/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/admin-logs/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/src/styles.css" "$BACKUP_DIR/ai-admin-platform/admin-web/src/styles.css" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install dashboard analytics UI"
install -m 0644 "$SRC/api-server/src/modules/admin-logs/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/admin-logs/routes.ts"
install -m 0644 "$SRC/api-server/dist/modules/admin-logs/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/admin-logs/routes.js"
install -m 0644 "$SRC/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
install -m 0644 "$SRC/admin-web/src/styles.css" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
cp -a "$SRC/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "verify installed markers"
grep -Fq "creditSummary" "$REMOTE_APP_ROOT/api-server/dist/modules/admin-logs/routes.js"
grep -Fq "walletPeriodBucketSql" "$REMOTE_APP_ROOT/api-server/dist/modules/admin-logs/routes.js"
grep -Fq "DashboardBarChart" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
grep -Fq ".dashboardMetricGrid" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
grep -Rqs "积分构成" "$REMOTE_APP_ROOT/admin-web/dist" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"

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
