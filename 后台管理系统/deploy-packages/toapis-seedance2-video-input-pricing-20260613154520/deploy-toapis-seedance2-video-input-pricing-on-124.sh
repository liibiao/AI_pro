#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="toapis-seedance2-video-input-pricing-20260613154520"
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
    if [ -d "$candidate/api-server" ] && [ -d "$candidate/admin-web" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"
command -v node >/dev/null 2>&1 || fail "node is required"

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
install_dir(){
  local rel="$1"
  local dest="$2"
  [ -d "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$dest"
  if [ -d "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/${dest#/}"
    run_sudo cp -a "$dest/." "$BACKUP_DIR/${dest#/}/"
  fi
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed directory $dest"
}

log "verify package markers"
grep -Fq "hasVideoInputForPricing" "$SRC/api-server/dist/billing.js"
grep -Fq "with_video_input" "$SRC/api-server/dist/pricing.js"
grep -Fq "TOAPIS_SEEDANCE2_VIDEO_PRICING" "$SRC/api-server/dist/apply-toapis-seedance2-channels.js"
grep -Fq "videoScenarioTierPrices" "$SRC/admin-web/src/main.tsx"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
for rel in \
  api-server/src/billing.ts \
  api-server/src/pricing.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/src/modules/workbench-compat/routes.ts \
  api-server/src/apply-toapis-seedance2-channels.ts \
  api-server/src/sync-canvas-models.ts \
  api-server/dist/billing.js \
  api-server/dist/pricing.js \
  api-server/dist/modules/generation/routes.js \
  api-server/dist/modules/workbench-compat/routes.js \
  api-server/dist/apply-toapis-seedance2-channels.js \
  api-server/dist/sync-canvas-models.js \
  api-server/package.json; do
  install_file "$rel" "$APP_DIR/$rel"
done

log "install admin-web"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

API_DIR="$APP_DIR/api-server"
log "upgrade ToAPIs Seedance 2 pricing"
run_sudo bash -lc "cd '$API_DIR' && node dist/apply-toapis-seedance2-channels.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify database pricing"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';

const expected = {
  'canvas-toapis-seedance-2': [
    ['480p', 45, 27, 27],
    ['720p', 90, 54, 54],
    ['1080p', 225, 135, 135],
  ],
  'canvas-toapis-seedance-2-fast': [
    ['480p', 36, 18, 18],
    ['720p', 72, 45, 45],
  ],
};

const rows = await prisma.aiModel.findMany({
  where: { id: { in: Object.keys(expected) } },
  include: { provider: true },
  orderBy: { id: 'asc' },
});

for (const [id, tiers] of Object.entries(expected)) {
  const row = rows.find(item => item.id === id);
  if (!row) throw new Error(`missing ToAPIs model: ${id}`);
  const pricing = row.defaults?.pricing;
  if (pricing?.unit !== 'second') throw new Error(`${id} pricing unit is not second`);
  if (pricing?.billingMode !== 'per_second') throw new Error(`${id} billingMode is not per_second`);
  if (!Array.isArray(pricing?.resolutionTiers)) throw new Error(`${id} resolutionTiers missing`);
  for (const [resolution, noVideoExpected, outputExpected, inputExpected] of tiers) {
    const tier = pricing.resolutionTiers.find(item => item.resolution === resolution);
    if (!tier) throw new Error(`${id} missing tier ${resolution}`);
    const noVideo = tier.scenarioTiers?.find(item => item.scenario === 'no_video_input');
    const withVideo = tier.scenarioTiers?.find(item => item.scenario === 'with_video_input');
    if (!noVideo || !withVideo) throw new Error(`${id} missing scenario tiers for ${resolution}`);
    if (Number(noVideo.outputCreditsPerSecond) !== noVideoExpected) throw new Error(`${id} bad no-video price for ${resolution}`);
    if (Number(withVideo.outputCreditsPerSecond) !== outputExpected) throw new Error(`${id} bad with-video output price for ${resolution}`);
    if (Number(withVideo.inputCreditsPerSecond) !== inputExpected) throw new Error(`${id} bad with-video input price for ${resolution}`);
  }
  console.log(`${row.id}: status=${row.status} provider=${row.provider.providerKey} providerStatus=${row.provider.status} pricing=ok`);
}

await prisma.$disconnect();
NODE

grep -Fq "hasVideoInputForPricing" "$APP_DIR/api-server/dist/billing.js"
grep -Fq "videoScenarioTierPrices" "$APP_DIR/admin-web/dist/assets/"*.js
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done"
echo "backup: $BACKUP_DIR"
