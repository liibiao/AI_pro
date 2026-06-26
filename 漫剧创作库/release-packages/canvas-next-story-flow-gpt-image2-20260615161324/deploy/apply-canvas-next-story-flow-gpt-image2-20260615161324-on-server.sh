#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-next-story-flow-gpt-image2-20260615161324"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}}"

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

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

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
  log "installed $dest"
}

install_optional_existing(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  if ! run_sudo test -e "$dest"; then
    log "skip $label, target not found: $dest"
    return 0
  fi
  install_file "$src" "$dest" "$label"
}

verify_file_marker(){
  local file="$1" marker="$2" label="$3"
  run_sudo test -f "$file" || fail "$label not found: $file"
  run_sudo grep -Fq "$marker" "$file" || fail "$label missing marker: $marker"
  log "verified $label marker"
}

verify_optional_marker(){
  local file="$1" marker="$2" label="$3"
  run_sudo test -f "$file" || return 0
  run_sudo grep -Fq "$marker" "$file" || fail "$label missing marker: $marker"
  log "verified $label marker"
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

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
grep -Fq "assetConfirm:{cat:'edit'" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "function renderAssetConfirmControls" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "shotVideoPrompt" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "if (wanted === 'gpt-image-2')" "$SRC/smart-vision/app/scripts/bridge-server.mjs"
grep -Fq "def _parse_json_response" "$SRC/tools/image_studio_backend.py"
grep -Fq "image-studio-canvas-next.html" "$SRC/tools/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install public workbench: $WORKBENCH_DIR"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas-next"

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas-next"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

install_optional_existing "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/smart-vision/app/scripts/bridge-server.mjs" "$MIRROR_TARGET/smart-vision/app/scripts/bridge-server.mjs" "smart vision bridge server"

log "verify installed markers"
verify_file_marker "$WORKBENCH_DIR/image-studio-canvas-next.html" "assetConfirm:{cat:'edit'" "public canvas asset confirm type"
verify_file_marker "$WORKBENCH_DIR/image-studio-canvas-next.html" "function renderAssetConfirmControls" "public canvas asset confirm render"
verify_file_marker "$WORKBENCH_DIR/image-studio-canvas-next.html" "shotVideoPrompt" "public canvas shot video prompt"
verify_optional_marker "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "assetConfirm:{cat:'edit'" "mirror canvas asset confirm type"
verify_optional_marker "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "function renderAssetConfirmControls" "mirror canvas asset confirm render"
verify_optional_marker "$MIRROR_TARGET/smart-vision/app/scripts/bridge-server.mjs" "if (wanted === 'gpt-image-2')" "bridge gpt-image-2 alias"
verify_optional_marker "$MIRROR_TARGET/tools/image_studio_backend.py" "def _parse_json_response" "image backend JSON diagnostics"
verify_optional_marker "$MIRROR_TARGET/tools/workbench_server.py" "image-studio-canvas-next.html" "workbench canvas-next route"

if command -v python3 >/dev/null 2>&1; then
  if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py" && run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
    log "python syntax check on server"
    (cd "$MIRROR_TARGET" && python3 -m py_compile tools/image_studio_backend.py tools/workbench_server.py)
  fi
fi

if command -v node >/dev/null 2>&1 && run_sudo test -f "$MIRROR_TARGET/smart-vision/app/scripts/bridge-server.mjs"; then
  log "node syntax check bridge on server"
  (cd "$MIRROR_TARGET" && node --check smart-vision/app/scripts/bridge-server.mjs)
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench smart-vision-bridge smart-vision-bridge-server; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; no known process found"
fi

if command -v curl >/dev/null 2>&1; then
  log "server HTTP smoke"
  curl -fsS --max-time 8 "http://127.0.0.1/workbench-web/image-studio-canvas-next.html" >/dev/null || \
  curl -fsS --max-time 8 "http://127.0.0.1/image-studio-canvas-next.html" >/dev/null || \
  log "HTTP smoke skipped/failed; file markers already verified"
fi

log "done"
echo "backup: $BACKUP_DIR"
