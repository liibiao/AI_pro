#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="flow2api-gemini-omni-video-fix-20260613165849"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
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
  if [ "$(id -un 2>/dev/null || true)" = "$PM2_USER" ] && command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  else
    return 127
  fi
}
pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 1
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
  log "installed $dest"
}
install_if_dir(){
  local src="$1" dest="$2" label="$3" dir
  dir="$(dirname "$dest")"
  if run_sudo test -d "$dir"; then
    install_file "$src" "$dest" "$label"
    return 0
  fi
  log "$label skipped, not found: $dir"
  return 1
}
verify_backend(){
  local file="$1"
  grep -Fq "def build_gemini_omni_request_body" "$file"
  grep -Fq "def start_gemini_omni_video" "$file"
  grep -Fq "def get_gemini_omni_video_status" "$file"
  grep -Fq "def generate_gemini_omni_video" "$file"
  grep -Fq "return f\"{base}/videos\".*else f\"{base}/videos\"" "$file" || grep -Fq "else f\"{base}/videos\"" "$file"
  grep -Fq "contentAuthRequired\": not _is_toapis_gemini_omni_endpoint(endpoint_url)" "$file"
  grep -Fq "content_url = f\"{status_endpoint.rstrip('/')}/content\"" "$file"
}
verify_backend_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_backend); verify_backend \"\$0\"" "$file"
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_backend "$SRC/smart-vision/services/workbench/image_studio_backend.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if install_if_dir "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"; then
  installed=1
fi
if install_if_dir "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"; then
  installed=1
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
install_if_dir "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend" || true
install_if_dir "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$RUNTIME_ROOT/smart-vision/services/workbench/image_studio_backend.py" "runtime smart image backend" || true

[ "$installed" = "1" ] || fail "no backend target found"

log "verify installed markers"
if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
  verify_backend_sudo "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then
  verify_backend_sudo "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"
fi
if run_sudo test -f "$RUNTIME_ROOT/tools/image_studio_backend.py"; then
  verify_backend_sudo "$RUNTIME_ROOT/tools/image_studio_backend.py"
fi

if command -v python3 >/dev/null 2>&1; then
  if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
    python3 -m py_compile "$MIRROR_TARGET/tools/image_studio_backend.py" >/dev/null 2>&1 || log "mirror backend compile check skipped/failed"
  fi
  if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then
    python3 -m py_compile "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" >/dev/null 2>&1 || log "smart backend compile check skipped/failed"
  fi
fi

log "restart backend if pm2 process exists"
RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 1 ]; then
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped; restart the workbench/backend service manually if it is long-running"
fi

log "done"
