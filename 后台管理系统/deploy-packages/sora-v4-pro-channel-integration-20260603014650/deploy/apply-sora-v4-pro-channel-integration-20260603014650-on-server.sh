#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v4-pro-channel-integration-20260603014650"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
BACKEND_DIR="${BACKEND_DIR:-${ADMIN_ROOT:-}}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$BACKEND_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      BACKEND_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$BACKEND_DIR" ] || fail "BACKEND_DIR not found; set BACKEND_DIR=/path/to/admin platform"
[ -d "$BACKEND_DIR/api-server" ] || fail "api-server not found: $BACKEND_DIR/api-server"

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

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword -xzf "$ARCHIVE" -C "$WORK_DIR"
PKG_ROOT="$WORK_DIR/$PKG"
[ -d "$PKG_ROOT" ] || PKG_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  if [ -f "$PKG_ROOT/$rel" ]; then
    printf '%s\n' "$PKG_ROOT/$rel"
  else
    fail "$rel not found in package"
  fi
}

backup_one(){
  local dest="$1"
  local name
  name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
  if [ -f "$dest" ]; then
    run_sudo cp -p "$dest" "$BACKUP_DIR/$name.bak"
  fi
}

install_to(){
  local rel="$1"
  local dest="$2"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_canvas(){
  local rel="$1"
  local web_rel="${rel#tools/}"
  install_to "$rel" "$WEB_ROOT/$web_rel"
  if [ -d "$MIRROR_ROOT" ]; then
    install_to "$rel" "$MIRROR_ROOT/$rel"
  fi
}

install_mirror(){
  local rel="$1"
  if [ -d "$MIRROR_ROOT" ]; then
    install_to "$rel" "$MIRROR_ROOT/$rel"
  else
    log "mirror root missing, skip $rel"
  fi
}

install_api(){
  local rel="$1"
  local api_rel="${rel#api-server/}"
  install_to "$rel" "$BACKEND_DIR/api-server/$api_rel"
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}}"
run_sudo mkdir -p "$BACKUP_DIR"

log "install canvas/static files"
install_canvas "tools/workbench-web/image-studio-canvas-next.html"
install_canvas "tools/workbench-web/model-registry.json"
install_canvas "tools/workbench-web/models/sora-v4-pro.json"
install_mirror "tools/image_studio_backend.py"
install_mirror "smart-vision/config/model-registry.json"
install_mirror "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
install_mirror "smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v4-pro.json"

log "install api-server source"
install_api "api-server/src/modules/generation/adapters/registry.ts"
install_api "api-server/src/modules/models/routes.ts"
install_api "api-server/src/modules/workbench-compat/routes.ts"
install_api "api-server/src/sync-canvas-models.ts"

API_DIR="$BACKEND_DIR/api-server"
log "build api-server"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/typescript/bin/tsc" ]; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  fail "npm or node+typescript not found; cannot build api-server"
fi

log "sync canvas model config into database"
if command -v npm >/dev/null 2>&1; then
  run_sudo env CANVAS_MODELS_DIR="$MIRROR_ROOT/tools/workbench-web/models" bash -lc "cd '$API_DIR' && npm run sync:canvas-models"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/tsx/dist/cli.mjs" ]; then
  run_sudo env CANVAS_MODELS_DIR="$MIRROR_ROOT/tools/workbench-web/models" bash -lc "cd '$API_DIR' && node node_modules/tsx/dist/cli.mjs src/sync-canvas-models.ts"
else
  fail "npm or node+tsx not found; cannot sync canvas models"
fi

log "restart api service"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env || pm2 restart all --update-env || true
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" bash -lc "pm2 restart '$PM2_APP' --update-env || pm2 restart all --update-env; pm2 save || true" || true
else
  log "pm2 not found, skip restart"
fi

log "verify markers"
grep -Fq "sora-v4-pro" "$WEB_ROOT/workbench-web/models/sora-v4-pro.json"
grep -Fq "SORA_V3_DOC_DURATIONS" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "reference_videos" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "submitSoraV3NoteVideo" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -Fq "audio-to-mp4" "$API_DIR/src/modules/workbench-compat/routes.ts"
grep -Fq "sora-v4-pro" "$API_DIR/src/sync-canvas-models.ts"

log "done"
echo "backup: $BACKUP_DIR"
echo "model: canvas-sora-v4-pro"
echo "Hard-refresh the canvas page after deploy."
