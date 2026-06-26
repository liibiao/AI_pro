#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aistartlab-video-adapter-20260626000248"
ARCHIVE="${1:?usage: apply-aistartlab-video-adapter-20260626000248-on-server.sh <archive.tar.gz>}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
API_ROOT="${API_ROOT:-$REMOTE_ROOT/ai-admin-platform/api-server}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

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
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
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
  case "$dest" in
    "$API_ROOT"/*)
      if id ubuntu >/dev/null 2>&1; then
        run_sudo chown ubuntu:ubuntu "$dest" 2>/dev/null || true
      fi
      ;;
    /var/www/*)
      if id www-data >/dev/null 2>&1; then
        run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
      fi
      ;;
  esac
  log "installed $dest"
}

install_if_parent_exists(){
  local src="$1" dest="$2" label="$3"
  if run_sudo test -d "$(dirname "$dest")"; then
    install_file "$src" "$dest" "$label"
    INSTALLED_CONFIG=$((INSTALLED_CONFIG + 1))
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_api_registry(){
  local file="$1"
  grep -Fq "'aistartlab-video': { submit: submitAistartLabVideo, query: queryAistartLabVideo }" "$file"
  grep -Fq "submitAistartLabVideo" "$file"
  grep -Fq "queryAistartLabVideo" "$file"
  grep -Fq "buildAistartLabVideoRequestJson" "$file"
  grep -Fq "resolveAistartLabChannel" "$file"
  grep -Fq "normalizeAistartLabVideoTaskResult" "$file"
  grep -Fq "AISTARTLAB_TOO_MANY_IMAGES" "$file"
}

verify_api_routes(){
  local file="$1"
  grep -Fq "configuredLower === 'aistartlab-video'" "$file"
  grep -Fq "aistarslab-video" "$file"
  grep -Fq "api.video.aistarslab.com" "$file"
  grep -Fq "return 'aistartlab-video'" "$file"
}

verify_registry_json(){
  local file="$1"
  grep -Fq '"configId": "aistartlab-video-test"' "$file"
  grep -Fq '"identityKey": "aistartlab::video-test"' "$file"
  grep -Fq '"adapter": "aistartlab-video"' "$file"
}

verify_model_json(){
  local file="$1"
  grep -Fq '"id": "aistartlab-video-test"' "$file"
  grep -Fq '"model": "test-video"' "$file"
  grep -Fq '"baseUrl": "https://api.video.aistarslab.com/openapi"' "$file"
  grep -Fq '"key": ""' "$file"
  grep -Fq '"endpointPath": "/video/task/v2"' "$file"
  grep -Fq '"statusEndpointPath": "/video/task/status"' "$file"
  grep -Fq '"channel": "test"' "$file"
}

verify_json_with_node(){
  local file="$1"
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file" >/dev/null
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_ROOT" || fail "api root not found: $API_ROOT"
command -v node >/dev/null 2>&1 || fail "node not found on remote"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_api_registry "$SRC/payload/api-server/src/modules/generation/adapters/registry.ts"
verify_api_registry "$SRC/payload/api-server/dist/modules/generation/adapters/registry.js"
verify_api_routes "$SRC/payload/api-server/src/modules/generation/routes.ts"
verify_api_routes "$SRC/payload/api-server/dist/modules/generation/routes.js"
verify_registry_json "$SRC/workbench-web/model-registry.json"
verify_model_json "$SRC/workbench-web/models/aistartlab-video-test.json"
verify_registry_json "$SRC/tools/workbench-web/model-registry.json"
verify_model_json "$SRC/tools/workbench-web/models/aistartlab-video-test.json"
verify_registry_json "$SRC/smart-vision/config/model-registry.json"
verify_registry_json "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
verify_model_json "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json"
verify_registry_json "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/model-registry.json"
verify_model_json "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/models/aistartlab-video-test.json"
verify_json_with_node "$SRC/workbench-web/model-registry.json"
verify_json_with_node "$SRC/workbench-web/models/aistartlab-video-test.json"
verify_json_with_node "$SRC/smart-vision/config/model-registry.json"
verify_json_with_node "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
verify_json_with_node "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/model-registry.json"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api adapter and routing"
install_file "$SRC/payload/api-server/src/modules/generation/adapters/registry.ts" "$API_ROOT/src/modules/generation/adapters/registry.ts" "api source adapter registry"
install_file "$SRC/payload/api-server/src/modules/generation/routes.ts" "$API_ROOT/src/modules/generation/routes.ts" "api source generation routes"
install_file "$SRC/payload/api-server/dist/modules/generation/adapters/registry.js" "$API_ROOT/dist/modules/generation/adapters/registry.js" "api dist adapter registry"
install_file "$SRC/payload/api-server/dist/modules/generation/routes.js" "$API_ROOT/dist/modules/generation/routes.js" "api dist generation routes"

INSTALLED_CONFIG=0
install_if_parent_exists "$SRC/workbench-web/model-registry.json" "$WORKBENCH_DIR/model-registry.json" "public model registry"
install_if_parent_exists "$SRC/workbench-web/models/aistartlab-video-test.json" "$WORKBENCH_DIR/models/aistartlab-video-test.json" "public AIStartLab model"
install_if_parent_exists "$SRC/tools/workbench-web/model-registry.json" "$MIRROR_ROOT/tools/workbench-web/model-registry.json" "mirror model registry"
install_if_parent_exists "$SRC/tools/workbench-web/models/aistartlab-video-test.json" "$MIRROR_ROOT/tools/workbench-web/models/aistartlab-video-test.json" "mirror AIStartLab model"
install_if_parent_exists "$SRC/smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json" "smart-vision config registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "smart legacy model registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json" "smart legacy AIStartLab model"
install_if_parent_exists "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/model-registry.json" "$RUNTIME_ROOT/tools/workbench-web/model-registry.json" "runtime model registry"
install_if_parent_exists "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/models/aistartlab-video-test.json" "$RUNTIME_ROOT/tools/workbench-web/models/aistartlab-video-test.json" "runtime AIStartLab model"
[ "$INSTALLED_CONFIG" -gt 0 ] || fail "no workbench config target installed"

log "verify installed markers"
verify_api_registry "$API_ROOT/src/modules/generation/adapters/registry.ts"
verify_api_registry "$API_ROOT/dist/modules/generation/adapters/registry.js"
verify_api_routes "$API_ROOT/src/modules/generation/routes.ts"
verify_api_routes "$API_ROOT/dist/modules/generation/routes.js"
node --check "$API_ROOT/dist/modules/generation/adapters/registry.js" >/dev/null
node --check "$API_ROOT/dist/modules/generation/routes.js" >/dev/null

if run_sudo test -f "$WORKBENCH_DIR/model-registry.json"; then verify_registry_json "$WORKBENCH_DIR/model-registry.json"; fi
if run_sudo test -f "$WORKBENCH_DIR/models/aistartlab-video-test.json"; then verify_model_json "$WORKBENCH_DIR/models/aistartlab-video-test.json"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/model-registry.json"; then verify_registry_json "$MIRROR_ROOT/tools/workbench-web/model-registry.json"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/models/aistartlab-video-test.json"; then verify_model_json "$MIRROR_ROOT/tools/workbench-web/models/aistartlab-video-test.json"; fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/config/model-registry.json"; then verify_registry_json "$MIRROR_ROOT/smart-vision/config/model-registry.json"; fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"; then verify_registry_json "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"; fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json"; then verify_model_json "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json"; fi
if run_sudo test -f "$RUNTIME_ROOT/tools/workbench-web/model-registry.json"; then verify_registry_json "$RUNTIME_ROOT/tools/workbench-web/model-registry.json"; fi
if run_sudo test -f "$RUNTIME_ROOT/tools/workbench-web/models/aistartlab-video-test.json"; then verify_model_json "$RUNTIME_ROOT/tools/workbench-web/models/aistartlab-video-test.json"; fi

log "restart pm2: $PM2_APP"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
  pm2_run status "$PM2_APP" --no-color | sed -n '1,8p'
else
  fail "$PM2_APP PM2 process not found"
fi

log "done: $PKG"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
