#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance-full-sz-seedance2-20260624020505"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
APP_ROOT="${APP_ROOT:-$WEB_ROOT/ai-admin-platform}"
API_SERVER="${API_SERVER:-$APP_ROOT/api-server}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}

pm2_run(){
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 0
  if pm2_run show "$name" >/dev/null 2>&1; then
    log "restart pm2: $name"
    pm2_run restart "$name" --update-env >/dev/null
    return 0
  fi
  return 1
}

backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}

remove_file_if_exists(){
  local dest="$1"
  if run_sudo test -f "$dest"; then
    backup_file "$dest"
    run_sudo rm -f "$dest"
    log "removed stale $dest"
  fi
}

install_if_parent_exists(){
  local src="$1" dest="$2" label="$3"
  if run_sudo test -d "$(dirname "$dest")"; then
    install_file "$src" "$dest" "$label"
    INSTALLED=$((INSTALLED + 1))
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_model(){
  local file="$1"
  grep -Fq '"id": "sz-seedance2"' "$file"
  grep -Fq '"model": "sz-seedance2"' "$file"
  grep -Fq '"adapter": "seedance-full"' "$file"
  grep -Fq '"endpointPath": "/seedance-full/generate"' "$file"
  grep -Fq '"statusEndpointPath": "/seedance-full/task/{taskId}"' "$file"
  grep -Fq '"resolutions": ["720p", "1080p"]' "$file"
  grep -Fq '"durations": [10, 11, 12, 13, 14, 15]' "$file"
  grep -Fq '"chargedCreditsPerSecond": 45' "$file"
  grep -Fq '"chargedCreditsPerSecond": 60' "$file"
  grep -Fq '"1080p": "sz-seedance2-1080p"' "$file"
  if grep -Fq '"480p"' "$file"; then
    fail "model config must not contain 480p: $file"
  fi
}

verify_registry(){
  local file="$1"
  grep -Fq '"configId": "sz-seedance2"' "$file"
  grep -Fq '"identityKey": "seedance-full::sz-seedance2"' "$file"
  grep -Fq '"adapter": "seedance-full"' "$file"
  if grep -Fq 'seedance-full-720p' "$file" || grep -Fq 'seedance-full-1080p' "$file"; then
    fail "registry still contains split seedance-full ids: $file"
  fi
}

verify_backend(){
  local file="$1"
  grep -Fq "def build_seedance_full_request_body" "$file"
  grep -Fq "def start_seedance_full_video" "$file"
  grep -Fq "def get_seedance_full_video_status" "$file"
  grep -Fq "def generate_seedance_full_video" "$file"
  grep -Fq "sz-seedance2-1080p" "$file"
}

verify_server(){
  local file="$1"
  grep -Fq "_seedance_full_submit_url" "$file"
  grep -Fq 'prefix = "tools/workbench-web/"' "$file"
}

verify_frontend(){
  local file="$1"
  grep -Eq "seedance-full|sz-seedance2" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_model "$SRC/workbench-web/models/sz-seedance2.json"
verify_model "$SRC/tools/workbench-web/models/sz-seedance2.json"
verify_model "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/sz-seedance2.json"
verify_registry "$SRC/workbench-web/model-registry.json"
verify_registry "$SRC/tools/workbench-web/model-registry.json"
verify_registry "$SRC/smart-vision/config/model-registry.json"
verify_registry "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_backend "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_server "$SRC/tools/workbench_server.py"
verify_server "$SRC/smart-vision/services/workbench/workbench_server.py"
verify_frontend "$SRC/workbench-web/image-studio-canvas.html"
verify_frontend "$SRC/workbench-web/image-studio-canvas-next.html"
verify_frontend "$SRC/workbench-web/canvas-next/generator-adapters.js"
verify_frontend "$SRC/workbench-web/canvas-next/generation-service.js"
grep -Fq "SEEDANCE_FULL_SZ_SEEDANCE2_ADAPTER" "$SRC/api-server/scripts/patch-seedance-full-adapter.mjs"
grep -Fq "providerKey: 'seedance-full'" "$SRC/api-server/scripts/apply-seedance-full-sz-seedance2.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/model-registry.json" "$WORKBENCH_DIR/model-registry.json" "public registry"
  install_file "$SRC/workbench-web/models/sz-seedance2.json" "$WORKBENCH_DIR/models/sz-seedance2.json" "public sz seedance2 model"
  install_file "$SRC/workbench-web/canvas-next/generator-adapters.js" "$WORKBENCH_DIR/canvas-next/generator-adapters.js" "public generator adapters"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
  remove_file_if_exists "$WORKBENCH_DIR/models/seedance-full-720p.json"
  remove_file_if_exists "$WORKBENCH_DIR/models/seedance-full-1080p.json"
  INSTALLED=$((INSTALLED + 1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror canvas"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
install_if_parent_exists "$SRC/tools/workbench-web/model-registry.json" "$MIRROR_TARGET/tools/workbench-web/model-registry.json" "mirror registry"
install_if_parent_exists "$SRC/tools/workbench-web/models/sz-seedance2.json" "$MIRROR_TARGET/tools/workbench-web/models/sz-seedance2.json" "mirror model"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generator-adapters.js" "mirror generator adapters"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
install_if_parent_exists "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
remove_file_if_exists "$MIRROR_TARGET/tools/workbench-web/models/seedance-full-720p.json"
remove_file_if_exists "$MIRROR_TARGET/tools/workbench-web/models/seedance-full-1080p.json"

install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart backend"
install_if_parent_exists "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
install_if_parent_exists "$SRC/smart-vision/config/model-registry.json" "$MIRROR_TARGET/smart-vision/config/model-registry.json" "smart config registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "smart legacy registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/sz-seedance2.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/sz-seedance2.json" "smart legacy model"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "smart legacy generator adapters"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "smart legacy generation service"
remove_file_if_exists "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance-full-720p.json"
remove_file_if_exists "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance-full-1080p.json"

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$RUNTIME_ROOT/tools/workbench-web/model-registry.json" "runtime registry"
  install_file "$SRC/tools/workbench-web/models/sz-seedance2.json" "$RUNTIME_ROOT/tools/workbench-web/models/sz-seedance2.json" "runtime model"
  install_file "$SRC/tools/workbench-web/canvas-next/generator-adapters.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generator-adapters.js" "runtime generator adapters"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend"
  install_file "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"
  remove_file_if_exists "$RUNTIME_ROOT/tools/workbench-web/models/seedance-full-720p.json"
  remove_file_if_exists "$RUNTIME_ROOT/tools/workbench-web/models/seedance-full-1080p.json"
fi

[ "$INSTALLED" -gt 0 ] || fail "no public or mirror workbench target found"

if run_sudo test -d "$API_SERVER"; then
  log "install and run admin API migration"
  command -v node >/dev/null 2>&1 || fail "node not found on server, cannot patch api-server"
  install_file "$SRC/api-server/scripts/patch-seedance-full-adapter.mjs" "$API_SERVER/scripts/patch-seedance-full-adapter.mjs" "api adapter patch"
  install_file "$SRC/api-server/scripts/apply-seedance-full-sz-seedance2.mjs" "$API_SERVER/scripts/apply-seedance-full-sz-seedance2.mjs" "api model migration"
  (cd "$API_SERVER" && node scripts/patch-seedance-full-adapter.mjs)
  (cd "$API_SERVER" && CANVAS_MODEL_CONFIG="$WORKBENCH_DIR/models/sz-seedance2.json" node scripts/apply-seedance-full-sz-seedance2.mjs)
else
  log "api server skipped, not found: $API_SERVER"
fi

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/models/sz-seedance2.json"; then
  run_sudo grep -Fq '"model": "sz-seedance2"' "$WORKBENCH_DIR/models/sz-seedance2.json"
  run_sudo grep -Fq '"1080p": "sz-seedance2-1080p"' "$WORKBENCH_DIR/models/sz-seedance2.json"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
  run_sudo grep -Fq "def build_seedance_full_request_body" "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then
  run_sudo grep -Fq "def build_seedance_full_request_body" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"
fi
if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
  [ "${#PY_FILES[@]}" -eq 0 ] || python3 -m py_compile "${PY_FILES[@]}" >/dev/null
fi

log "restart backend if pm2 process exists"
RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench studio-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 1 ]; then
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped; no known process found"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Seedance2.0 满血已部署为单模型 sz-seedance2；720p 提交 sz-seedance2，1080p 提交 sz-seedance2-1080p。"
