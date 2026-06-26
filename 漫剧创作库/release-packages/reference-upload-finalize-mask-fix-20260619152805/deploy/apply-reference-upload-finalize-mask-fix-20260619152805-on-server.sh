#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="reference-upload-finalize-mask-fix-20260619152805"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
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

verify_next_html(){
  local file="$1"
  grep -Fq "function confirmedUploadedReferenceValue" "$file"
  grep -Fq "function hasConfirmedUploadedReference" "$file"
  grep -Fq "hasAnyUploadedReference(entry)" "$file"
  grep -Fq "markReferenceUploadComplete(img,{clearPromise:true})" "$file"
  grep -Fq "delete img._uploadConfirmStartedAt" "$file"
  grep -Fq "publicVideoMediaUrl(media" "$file"
}

verify_legacy_html(){
  local file="$1"
  grep -Fq "function confirmedUploadedReferenceValue" "$file"
  grep -Fq "function hasConfirmedUploadedReference" "$file"
  grep -Fq "function isReferenceUploadInProgress(img){return !!(img&&(img._uploadPromise||['loading','compressing','uploading'].includes(img.status))&&!hasConfirmedUploadedReference(img));}" "$file"
  grep -Fq "const active=isReferenceUploadInProgress(img)" "$file"
  grep -Fq "delete img._uploadConfirmStartedAt" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_next_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_legacy_html "$SRC/workbench-web/image-studio-canvas.html"
verify_next_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_legacy_html "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_legacy_html "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas legacy"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html" "mirror canvas legacy"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"

if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas legacy"
  INSTALLED=$((INSTALLED+1))
else
  log "runtime workbench skipped, not found: $RUNTIME_ROOT/tools/workbench-web"
fi

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "function hasConfirmedUploadedReference" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "hasAnyUploadedReference(entry)" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas.html"; then
  run_sudo grep -Fq "const active=isReferenceUploadInProgress(img)" "$WORKBENCH_DIR/image-studio-canvas.html"
fi

RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench studio-workbench legacy-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; static workbench files were updated on disk"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
