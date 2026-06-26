#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-generation-resolution-pricing-20260622010210"
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
[ -d "$APP_DIR/admin-web" ] || fail "admin-web not found: $APP_DIR/admin-web"

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
grep -Fq "videoFlatPriceForInput(model, input)" "$SRC/api-server/dist/billing.js"
grep -Fq "pricingResolution" "$SRC/api-server/dist/billing.js"
grep -Fq "memberCreditsPerGeneration" "$SRC/api-server/dist/billing.js"
grep -Fq "videoGenerationTierPrices" "$SRC/admin-web/src/main.tsx"
grep -R -Fq "videoGenerationTierPrices" "$SRC/admin-web/dist/assets"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
install_file "api-server/src/billing.ts" "$APP_DIR/api-server/src/billing.ts"
install_file "api-server/dist/billing.js" "$APP_DIR/api-server/dist/billing.js"

log "install admin-web"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify installed markers"
grep -Fq "videoFlatPriceForInput(model, input)" "$APP_DIR/api-server/dist/billing.js"
grep -Fq "pricingResolution" "$APP_DIR/api-server/dist/billing.js"
grep -R -Fq "videoGenerationTierPrices" "$APP_DIR/admin-web/dist/assets"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  [ "$attempt" -lt 30 ] || fail "api health check failed"
  sleep 1
done

log "done"
echo "backup: $BACKUP_DIR"
