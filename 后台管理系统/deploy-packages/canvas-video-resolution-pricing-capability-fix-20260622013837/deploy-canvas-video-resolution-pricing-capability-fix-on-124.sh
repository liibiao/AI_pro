#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-video-resolution-pricing-capability-fix-20260622013837"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
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
verify_canvas_markers(){
  local file="$1"
  grep -Fq "function videoGenerationPricingTiers" "$file"
  grep -Fq "function videoGenerationPricingForResolution" "$file"
  grep -Fq "const generation=videoGenerationPricingForResolution(normalized,resolution)" "$file"
  grep -Fq "按次按所选分辨率计费" "$file"
}
verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_canvas_markers); verify_canvas_markers \"\$0\"" "$file"
}

log "verify package markers"
grep -Fq "mergeVideoPricingResolutions" "$SRC/api-server/dist/modules/models/routes.js"
grep -Fq "pricingVideoResolutionList" "$SRC/api-server/dist/modules/models/routes.js"
grep -Fq "normalizeCompatWorkbenchVideoCapabilities" "$SRC/api-server/dist/modules/workbench-compat/routes.js"
grep -Fq "compatPricingVideoResolutions" "$SRC/api-server/dist/modules/workbench-compat/routes.js"
verify_canvas_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
for rel in \
  api-server/src/modules/models/routes.ts \
  api-server/dist/modules/models/routes.js \
  api-server/src/modules/workbench-compat/routes.ts \
  api-server/dist/modules/workbench-compat/routes.js; do
  install_file "$rel" "$APP_DIR/$rel"
done

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify installed markers"
grep -Fq "mergeVideoPricingResolutions" "$APP_DIR/api-server/dist/modules/models/routes.js"
grep -Fq "pricingVideoResolutionList" "$APP_DIR/api-server/dist/modules/models/routes.js"
grep -Fq "normalizeCompatWorkbenchVideoCapabilities" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
grep -Fq "compatPricingVideoResolutions" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_canvas_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    break
  fi
  [ "$attempt" -lt 30 ] || fail "api health check failed"
  sleep 1
done

log "done"
echo "backup: $BACKUP_DIR"
echo "canvas: http://124.156.137.236/image-studio-canvas-next.html?v=$PKG"
