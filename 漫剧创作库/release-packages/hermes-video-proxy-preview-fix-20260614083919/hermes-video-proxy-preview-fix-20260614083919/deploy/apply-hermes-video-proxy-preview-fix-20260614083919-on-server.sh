#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="hermes-video-proxy-preview-fix-20260614083919"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
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
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
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
verify_next(){
  local file="$1"
  grep -Fq "function shouldProxyVideoPreviewUrl(url)" "$file"
  grep -Fq "hermes.67611.top" "$file"
  grep -Fq "/api/workbench/image-studio/video/proxy?remoteUrl=" "$file"
  grep -Fq "function videoHasUsableMetadata(video)" "$file"
  grep -Fq "function forgetNodeVideoPreviewFailures" "$file"
  grep -Fq "forgetNodeVideoPreviewFailures(n,video)" "$file"
  grep -Fq "payload.proxyContentUrl" "$file"
}
verify_server(){
  local file="$1"
  grep -Fq '"/api/workbench/image-studio/video/proxy"' "$file"
  grep -Fq '"Accept-Encoding": "identity"' "$file"
  grep -Fq 'self.headers.get("If-Range")' "$file"
  grep -Fq 'self.send_header("Content-Range", content_range)' "$file"
  grep -Fq 'self.send_header("Accept-Ranges", accept_ranges)' "$file"
}
verify_next_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_next); verify_next \"\$0\"" "$file"
}
verify_server_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_server); verify_server \"\$0\"" "$file"
}
compile_python_if_present(){
  local file="$1" label="$2"
  if run_sudo test -f "$file" && command -v python3 >/dev/null 2>&1; then
    if ! run_sudo python3 -m py_compile "$file" >/dev/null 2>&1; then
      log "$label compile check skipped/failed"
    fi
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
verify_next "$SRC/workbench-web/image-studio-canvas-next.html"
verify_next "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_server "$SRC/tools/workbench_server.py"
verify_server "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if install_if_dir "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"; then
  installed=1
fi
if install_if_dir "$SRC/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html" "public root canvas next"; then
  installed=1
fi
if install_if_dir "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"; then
  installed=1
fi
if install_if_dir "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"; then
  installed=1
fi
if install_if_dir "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart-vision workbench server"; then
  installed=1
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
install_if_dir "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next" || true
install_if_dir "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server" || true
install_if_dir "$SRC/smart-vision/services/workbench/workbench_server.py" "$RUNTIME_ROOT/smart-vision/services/workbench/workbench_server.py" "runtime smart workbench server" || true

[ "$installed" = "1" ] || fail "no deployment target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_next_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WEB_ROOT/image-studio-canvas-next.html"; then
  verify_next_sudo "$WEB_ROOT/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_next_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
  verify_server_sudo "$MIRROR_TARGET/tools/workbench_server.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"; then
  verify_server_sudo "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"
fi
if run_sudo test -f "$RUNTIME_ROOT/tools/workbench_server.py"; then
  verify_server_sudo "$RUNTIME_ROOT/tools/workbench_server.py"
fi

compile_python_if_present "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
compile_python_if_present "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
compile_python_if_present "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"

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
