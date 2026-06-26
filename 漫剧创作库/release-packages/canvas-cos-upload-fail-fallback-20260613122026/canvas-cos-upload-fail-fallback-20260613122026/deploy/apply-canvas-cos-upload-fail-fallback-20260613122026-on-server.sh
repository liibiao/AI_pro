#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-cos-upload-fail-fallback-20260613122026"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

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
  case "$dest" in
    /var/www/*)
      if id www-data >/dev/null 2>&1; then
        run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
      fi
      ;;
  esac
  log "installed $dest"
}
verify_html_markers(){
  local file="$1"
  grep -Fq "workbench-engine.js?v=20260613-cos-fail-fallback-v1" "$file"
  grep -Fq "function markReferenceUploadFailed" "$file"
  grep -Fq "markReferenceUploadFailed(img,err,'上传失败')" "$file"
  grep -Fq "waitReferenceImageUploadPromise(E.uploadReferenceImage(file,{mode:'object_storage'" "$file"
}
verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "workbench-engine.js?v=20260613-cos-fail-fallback-v1" "$file"
  run_sudo grep -Fq "function markReferenceUploadFailed" "$file"
  run_sudo grep -Fq "markReferenceUploadFailed(img,err,'上传失败')" "$file"
  run_sudo grep -Fq "waitReferenceImageUploadPromise(E.uploadReferenceImage(file,{mode:'object_storage'" "$file"
}
verify_engine_markers(){
  local file="$1"
  grep -Fq "async function uploadObjectStorageViaBackend" "$file"
  grep -Fq "直传失败，改用后端 COS" "$file"
  grep -Fq "后端转存失败" "$file"
  grep -Fq "COS 上传失败：" "$file"
}
verify_engine_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "async function uploadObjectStorageViaBackend" "$file"
  run_sudo grep -Fq "直传失败，改用后端 COS" "$file"
  run_sudo grep -Fq "后端转存失败" "$file"
  run_sudo grep -Fq "COS 上传失败：" "$file"
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
verify_engine_markers "$SRC/workbench-web/workbench-engine.js"
verify_engine_markers "$SRC/tools/workbench-web/workbench-engine.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  install_file "$SRC/workbench-web/workbench-engine.js" "$WORKBENCH_DIR/workbench-engine.js" "public workbench engine"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  log "install mirror tools: $MIRROR_ROOT"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$MIRROR_ROOT/tools/workbench-web/workbench-engine.js" "mirror workbench engine"
  INSTALLED=$((INSTALLED+1))
else
  log "mirror tools skipped, not found: $MIRROR_ROOT/tools/workbench-web"
fi

RUNTIME_ROOT="$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$RUNTIME_ROOT/tools/workbench-web/workbench-engine.js" "runtime workbench engine"
fi

[ "$INSTALLED" -gt 0 ] || fail "no public or mirror workbench target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WORKBENCH_DIR/workbench-engine.js"; then
  verify_engine_markers_sudo "$WORKBENCH_DIR/workbench-engine.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/workbench-engine.js"; then
  verify_engine_markers_sudo "$MIRROR_ROOT/tools/workbench-web/workbench-engine.js"
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
pm2_run save >/dev/null 2>&1 || true

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
