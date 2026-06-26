#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="newapi-model-config-tab-20260624122416"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

run_sudo(){
  "$@" && return 0
  local rc=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$rc"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$rc"
  fi
}

backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local backup="$BACKUP_DIR/${dest#/}"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_file(){
  local src="$1" dest="$2" label="${3:-file}"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $label: $dest"
}

install_optional_existing(){
  local src="$1" dest="$2" label="${3:-file}"
  [ -f "$src" ] || fail "$label missing in package: $src"
  if ! run_sudo test -e "$dest"; then
    log "skip $label, target not found: $dest"
    return 0
  fi
  install_file "$src" "$dest" "$label"
}

verify_html_markers(){
  local file="$1"
  grep -Fq "NEWAPI_MODEL_STATE" "$file"
  grep -Fq "requestModelManagementApi('/api/workbench/image-studio/newapi/models'" "$file"
  grep -Fq "requestModelManagementApi('/api/workbench/image-studio/newapi/import'" "$file"
  grep -Fq "data-model-tab=\"newapi\"" "$file"
  grep -Fq "id=\"modelConfigBtn\"" "$file"
  grep -Fq "Object.assign(window,{openModelModal,closeModelModal,renderModelModal,addModelEntry,editModelEntry})" "$file"
}

verify_server_markers(){
  local file="$1"
  grep -Fq "def fetch_newapi_models" "$file"
  grep -Fq "def import_newapi_models" "$file"
  grep -Fq "def update_image_studio_model_config" "$file"
  grep -Fq '"/api/workbench/image-studio/newapi/models"' "$file"
  grep -Fq '"/api/workbench/image-studio/newapi/import"' "$file"
  grep -Fq '"pricing": pricing' "$file"
}

verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "NEWAPI_MODEL_STATE" "$file"
  run_sudo grep -Fq "requestModelManagementApi('/api/workbench/image-studio/newapi/models'" "$file"
  run_sudo grep -Fq "requestModelManagementApi('/api/workbench/image-studio/newapi/import'" "$file"
  run_sudo grep -Fq "data-model-tab=\"newapi\"" "$file"
  run_sudo grep -Fq "id=\"modelConfigBtn\"" "$file"
}

verify_server_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "def fetch_newapi_models" "$file"
  run_sudo grep -Fq "def import_newapi_models" "$file"
  run_sudo grep -Fq "def update_image_studio_model_config" "$file"
  run_sudo grep -Fq '"/api/workbench/image-studio/newapi/models"' "$file"
  run_sudo grep -Fq '"/api/workbench/image-studio/newapi/import"' "$file"
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

pm2_restart_if_exists(){
  local name="$1"
  pm2_run show "$name" >/dev/null 2>&1 || return 1
  log "restart pm2: $name"
  pm2_run restart "$name" --update-env >/dev/null
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_server_markers "$SRC/tools/workbench_server.py"
verify_server_markers "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if run_sudo test -d "$WEB_ROOT"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html" "public root canvas next"
  installed=1
else
  log "public root skipped, not found: $WEB_ROOT"
fi

if run_sudo test -d "$MIRROR_TARGET/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_optional_existing "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"
  installed=1
fi

[ "$installed" = "1" ] || fail "no canvas target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WEB_ROOT/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WEB_ROOT/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/tools/workbench_server.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"
fi
if run_sudo test -f "$RUNTIME_ROOT/tools/workbench_server.py"; then
  verify_server_markers_sudo "$RUNTIME_ROOT/tools/workbench_server.py"
fi

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
  [ -f "$RUNTIME_ROOT/tools/workbench_server.py" ] && PY_FILES+=("$RUNTIME_ROOT/tools/workbench_server.py")
  if [ "${#PY_FILES[@]}" -gt 0 ]; then
    python3 -m py_compile "${PY_FILES[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
  fi
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart the backend/workbench service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=%s\n' "$(date +%Y%m%d%H%M%S)"
