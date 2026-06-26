#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-generation-resolution-billing-alias-fix-20260622011332"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi
run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}
backup_one(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$2"
  need_file "$rel"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

log "verify package markers"
grep -Fq "videoResolutionForInput" "$SRC/api-server/dist/billing.js"
grep -Fq "videoResolution" "$SRC/api-server/dist/modules/generation/routes.js"
grep -Fq "compatVideoResolution" "$SRC/api-server/dist/modules/workbench-compat/routes.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
for rel in \
  api-server/src/billing.ts \
  api-server/dist/billing.js \
  api-server/src/modules/generation/routes.ts \
  api-server/dist/modules/generation/routes.js \
  api-server/src/modules/workbench-compat/routes.ts \
  api-server/dist/modules/workbench-compat/routes.js; do
  install_file "$rel" "$APP_DIR/$rel"
done

API_DIR="$APP_DIR/api-server"
log "verify billing aliases"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import { calculateCredits, buildCreditDiscountBenefit } from './dist/billing.js';

const model = {
  type: 'VIDEO',
  unit: 'generation',
  salePrice: 800,
  costPrice: 0,
  pricePerSecond: 0,
  inputPriceUsdPer1m: 0,
  outputPriceUsdPer1m: 0,
  creditsPerUsdCost: 0,
  markupRate: 1,
  defaults: {
    pricing: {
      unit: 'generation',
      billingMode: 'per_generation',
      memberCreditsPerGeneration: 800,
      chargedCreditsPerGeneration: 800,
      resolutionTiers: [
        { resolution: '720p', memberCreditsPerGeneration: 800, chargedCreditsPerGeneration: 800, originalCreditsPerGeneration: 2000, costCreditsPerGeneration: 560 },
        { resolution: '1080p', memberCreditsPerGeneration: 900, chargedCreditsPerGeneration: 900, originalCreditsPerGeneration: 2250, costCreditsPerGeneration: 630 },
      ],
    },
  },
};
const member = calculateCredits(model, { quantity: 1, durationSeconds: 5, inputTokens: 0, outputTokens: 0, params: { videoResolution: '1080p' } }, buildCreditDiscountBenefit({ source: 'TEST', plan: { name: 'TEST' } }));
const size = calculateCredits(model, { quantity: 1, durationSeconds: 5, inputTokens: 0, outputTokens: 0, params: { size: '1920x1080' } }, buildCreditDiscountBenefit({ source: 'TEST', plan: { name: 'TEST' } }));
if (member.memberCreditsPerGeneration !== 900 || member.chargedCredits !== 900 || member.pricingResolution !== '1080p') throw new Error('videoResolution 1080p billing alias failed');
if (size.memberCreditsPerGeneration !== 900 || size.chargedCredits !== 900 || size.pricingResolution !== '1080p') throw new Error('size 1920x1080 billing alias failed');
console.log('billing-alias-ok');
NODE

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify installed markers"
grep -Fq "videoResolutionForInput" "$APP_DIR/api-server/dist/billing.js"
grep -Fq "compatVideoResolution" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  [ "$attempt" -lt 30 ] || fail "api health check failed"
  sleep 1
done

log "done"
echo "backup: $BACKUP_DIR"
