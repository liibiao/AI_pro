#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sd2-vip-per-second-resolution-fix-20260611161455"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

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
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
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
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 0
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/ai-admin-platform"
[ -d "$SRC/api-server" ] || fail "package api-server not found"
[ -d "$SRC/admin-web" ] || fail "package admin-web not found"

log "verify package markers"
grep -Fq "billingMode: 'per_second'" "$SRC/api-server/src/apply-lingdong-sd2-vip-channel.ts"
grep -Fq "resolutions: ['480p', '720p']" "$SRC/api-server/src/apply-lingdong-sd2-vip-channel.ts"
grep -Fq "return '480p';" "$SRC/api-server/src/modules/generation/adapters/registry.ts"
grep -Fq "defaultResolution: '720p'" "$SRC/api-server/src/modules/models/routes.ts"
grep -Fq "billingMode: 'per_second'" "$SRC/admin-web/src/main.tsx"
grep -Rqs "per_second" "$SRC/admin-web/dist"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

install_file(){
  local rel="$1"
  local dest="$2"
  [ -f "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    local backup_name
    backup_name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$backup_name.bak" 2>/dev/null || true
  fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_file "api-server/src/apply-lingdong-sd2-vip-channel.ts" "$APP_DIR/api-server/src/apply-lingdong-sd2-vip-channel.ts"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
install_file "api-server/dist/apply-lingdong-sd2-vip-channel.js" "$APP_DIR/api-server/dist/apply-lingdong-sd2-vip-channel.js"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_file "admin-web/src/styles.css" "$APP_DIR/admin-web/src/styles.css"

log "backup and install admin web dist"
run_sudo mkdir -p "$BACKUP_DIR/admin-web-dist"
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/admin-web-dist/" 2>/dev/null || true
run_sudo rm -rf "$APP_DIR/admin-web/dist"
run_sudo mkdir -p "$APP_DIR/admin-web/dist"
run_sudo cp -a "$SRC/admin-web/dist/." "$APP_DIR/admin-web/dist/"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json" || log "api-server tsc failed; using packaged dist"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "snapshot and migrate sd-2-vip model pricing/capabilities"
run_sudo bash -lc "cd '$APP_DIR/api-server' && node --input-type=module" <<'NODE'
import fs from 'node:fs';
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';

const backupPath = `/var/www/ai-admin/backups/sd2-vip-per-second-resolution-fix-20260611161455-model-before-${Date.now()}.json`;
const model = await prisma.aiModel.findFirst({
  where: {
    OR: [
      { id: 'canvas-lingdong-sd-2-vip' },
      { modelKey: 'lingdong-sd-2-vip' },
      { name: 'sd-2-vip' },
      { adapter: { in: ['lingdong-sd-2-vip', 'sd-2-vip'] } },
      { provider: { providerKey: { in: ['lingdong-sd-2-vip', 'sd-2-vip'] } } },
    ],
  },
  include: { provider: true },
});

if (!model) {
  console.log('SD2_VIP_MODEL_NOT_FOUND');
  await prisma.$disconnect();
  process.exit(0);
}

fs.writeFileSync(backupPath, JSON.stringify(model, null, 2));
console.log(`MODEL_BACKUP=${backupPath}`);

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const defaults = obj(model.defaults);
const pricing = obj(defaults.pricing);
const capabilities = obj(model.capabilities);
const existingTiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers : [];

function tierFor(resolution) {
  const wanted = String(resolution).toLowerCase();
  const legacy = wanted === '480p' ? 'small' : wanted === '720p' ? 'large' : wanted;
  return existingTiers.find((tier) => {
    const key = String(tier?.resolution || tier?.label || tier?.quality || '').toLowerCase();
    return key === wanted || key === legacy;
  }) || null;
}

function perSecondFor(resolution) {
  const tier = tierFor(resolution);
  const value = Number(
    tier?.memberCreditsPerSecond ??
    tier?.chargedCreditsPerSecond ??
    tier?.creditsPerSecond ??
    tier?.pricePerSecond ??
    pricing.memberCreditsPerSecond ??
    pricing.chargedCreditsPerSecond ??
    pricing.creditsPerSecond ??
    pricing.pricePerSecond ??
    model.pricePerSecond ??
    0,
  );
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function original(member) {
  return Math.max(member, Math.ceil(member / 0.4));
}

function cost(member) {
  return Number((member * 0.7).toFixed(4));
}

const resolutions = ['480p', '720p'];
const resolutionTiers = resolutions.map((resolution) => {
  const member = perSecondFor(resolution);
  return {
    resolution,
    chargedCreditsPerSecond: member,
    memberCreditsPerSecond: member,
    originalCreditsPerSecond: original(member),
    costCreditsPerSecond: cost(member),
  };
});
const firstTier = resolutionTiers[0];

const updated = await prisma.aiModel.update({
  where: { id: model.id },
  data: {
    unit: 'second',
    salePrice: 0,
    pricePerSecond: firstTier.chargedCreditsPerSecond,
    costPrice: new Prisma.Decimal(firstTier.costCreditsPerSecond),
    defaults: {
      ...defaults,
      size: '720p',
      resolution: '720p',
      pricing: {
        ...pricing,
        unit: 'second',
        billingMode: 'per_second',
        currency: pricing.currency || 'credits',
        creditsPerCny: Number(pricing.creditsPerCny || 100),
        memberDiscountRate: Number(pricing.memberDiscountRate || 0.4),
        chargedCreditsPerSecond: firstTier.chargedCreditsPerSecond,
        memberCreditsPerSecond: firstTier.memberCreditsPerSecond,
        originalCreditsPerSecond: firstTier.originalCreditsPerSecond,
        costCreditsPerSecond: firstTier.costCreditsPerSecond,
        resolutionTiers,
      },
    },
    capabilities: {
      ...capabilities,
      resolutions,
      sizes: resolutions,
      defaultResolution: '720p',
      defaultSize: '720p',
    },
  },
  include: { provider: true },
});

console.log('MIGRATED_MODEL ' + JSON.stringify({
  id: updated.id,
  modelKey: updated.modelKey,
  name: updated.name,
  unit: updated.unit,
  pricePerSecond: updated.pricePerSecond,
  status: updated.status,
  providerKey: updated.provider.providerKey,
  pricing: updated.defaults?.pricing,
  capabilities: updated.capabilities,
}, null, 2));

await prisma.$disconnect();
NODE

log "verify installed markers"
run_sudo grep -Fq "billingMode: 'per_second'" "$APP_DIR/api-server/src/apply-lingdong-sd2-vip-channel.ts"
run_sudo grep -Fq "return '480p';" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "defaultResolution: '720p'" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "billingMode: 'per_second'" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Rqs "per_second" "$APP_DIR/admin-web/dist"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"
curl -fsS http://127.0.0.1/admin/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1/admin/index.html >/dev/null 2>&1 || log "admin html healthcheck skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
