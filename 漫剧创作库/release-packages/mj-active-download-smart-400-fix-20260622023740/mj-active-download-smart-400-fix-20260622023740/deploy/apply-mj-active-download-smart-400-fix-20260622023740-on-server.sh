#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-active-download-smart-400-fix-20260622023740"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}}"

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
  [ -n "$name" ] || return 1
  pm2_run show "$name" >/dev/null 2>&1 || return 1
  log "restart pm2: $name"
  pm2_run restart "$name" --update-env >/dev/null
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
    INSTALLED=$((INSTALLED+1))
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_html_markers(){
  local file="$1"
  grep -Fq "function midjourneyActiveDownloadEntryForNode" "$file"
  grep -Fq "activeMjEntry?[activeMjEntry]:rawEntries" "$file"
  grep -Fq "images:[entry,..." "$file"
  grep -Fq "LLM 提示词通道失败，切换本地智能模式" "$file"
  grep -Fq "v.mjSpeedMode='FAST'" "$file"
}

verify_backend_markers(){
  local file="$1"
  grep -Fq "def _midjourney_stable_submit_retry_payloads" "$file"
  grep -Fq "FAST accountFilter fallback" "$file"
  grep -Fq "quality q2 without accountFilter fallback" "$file"
  grep -Fq "Submit fallback" "$file"
}

verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function midjourneyActiveDownloadEntryForNode" "$file"
  run_sudo grep -Fq "activeMjEntry?[activeMjEntry]:rawEntries" "$file"
  run_sudo grep -Fq "images:[entry,..." "$file"
  run_sudo grep -Fq "LLM 提示词通道失败，切换本地智能模式" "$file"
  run_sudo grep -Fq "v.mjSpeedMode='FAST'" "$file"
}

verify_backend_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "def _midjourney_stable_submit_retry_payloads" "$file"
  run_sudo grep -Fq "FAST accountFilter fallback" "$file"
  run_sudo grep -Fq "quality q2 without accountFilter fallback" "$file"
  run_sudo grep -Fq "Submit fallback" "$file"
}

compile_python_if_present(){
  local file="$1" label="$2"
  run_sudo test -f "$file" || return 0
  if command -v python3 >/dev/null 2>&1; then
    log "compile $label"
    run_sudo python3 -m py_compile "$file"
  else
    log "skip python compile for $label; python3 not found"
  fi
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
verify_backend_markers "$SRC/tools/image_studio_backend.py"
verify_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror tools image backend"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime tools image backend"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$RUNTIME_ROOT/smart-vision/services/workbench/image_studio_backend.py" "runtime smart-vision image backend"

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/tools/image_studio_backend.py"
  compile_python_if_present "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror tools image backend"
fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
  compile_python_if_present "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
fi
if run_sudo test -f "$RUNTIME_ROOT/tools/image_studio_backend.py"; then
  compile_python_if_present "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime tools image backend"
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
