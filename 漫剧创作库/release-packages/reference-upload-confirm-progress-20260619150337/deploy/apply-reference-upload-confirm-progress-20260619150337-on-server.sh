#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="reference-upload-confirm-progress-20260619150337"
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
  grep -Fq "function uploadFormDataWithProgress" "$file"
  grep -Fq "phase:'confirming'" "$file"
  grep -Fq "markReferenceUploadConfirming" "$file"
  grep -Fq "shouldShowReferenceUploadMask" "$file"
  grep -Fq "thumb-mask-text" "$file"
  grep -Fq "云端确认" "$file"
}

verify_canvas_html(){
  local file="$1"
  grep -Fq "fakeProgress(id,startProgress=null)" "$file"
  grep -Fq "progressLabel='云端确认" "$file"
  grep -Fq "thumb-mask-text" "$file"
  grep -Fq "querySelector('.thumb-mask-text')" "$file"
}

verify_engine(){
  local file="$1"
  grep -Fq "phase: 'confirming'" "$file"
  grep -Fq "percent: 99" "$file"
  grep -Fq "云端确认" "$file"
}

verify_generation_service(){
  local file="$1"
  grep -Fq "function requestFormDataWithProgress" "$file"
  grep -Fq "phase:'confirming'" "$file"
  grep -Fq "percent:99" "$file"
}

verify_app(){
  local file="$1"
  grep -Fq "const isObject=message&&typeof message==='object'" "$file"
  grep -Fq "const exact=Number(isObject?message.percent:NaN)" "$file"
  grep -Fq "stageLabel:label" "$file"
}

verify_tapnow(){
  local file="$1"
  grep -Fq ".thumb-mask-text" "$file"
  grep -Fq ".thumb-mask-fill" "$file"
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
verify_canvas_html "$SRC/workbench-web/image-studio-canvas.html"
verify_engine "$SRC/workbench-web/workbench-engine.js"
verify_generation_service "$SRC/workbench-web/canvas-next/generation-service.js"
verify_app "$SRC/workbench-web/canvas-next/app.js"
verify_tapnow "$SRC/workbench-web/canvas-next/tapnow-rewrite.css"

verify_next_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_canvas_html "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_engine "$SRC/tools/workbench-web/workbench-engine.js"
verify_generation_service "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_app "$SRC/tools/workbench-web/canvas-next/app.js"
verify_tapnow "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"

verify_canvas_html "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_engine "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js"
verify_generation_service "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_app "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/app.js"
verify_tapnow "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas legacy"
  install_file "$SRC/workbench-web/workbench-engine.js" "$WORKBENCH_DIR/workbench-engine.js" "public workbench engine"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
  install_file "$SRC/workbench-web/canvas-next/app.js" "$WORKBENCH_DIR/canvas-next/app.js" "public canvas app"
  install_file "$SRC/workbench-web/canvas-next/tapnow-rewrite.css" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css" "public tapnow styles"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html" "mirror canvas legacy"
install_if_parent_exists "$SRC/tools/workbench-web/workbench-engine.js" "$MIRROR_ROOT/tools/workbench-web/workbench-engine.js" "mirror workbench engine"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/app.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/app.js" "mirror canvas app"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css" "mirror tapnow styles"

install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "smart legacy engine"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "smart legacy generation service"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/app.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/app.js" "smart legacy canvas app"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css" "smart legacy tapnow styles"

if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas legacy"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$RUNTIME_ROOT/tools/workbench-web/workbench-engine.js" "runtime workbench engine"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_file "$SRC/tools/workbench-web/canvas-next/app.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/app.js" "runtime canvas app"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css" "runtime tapnow styles"
  INSTALLED=$((INSTALLED+1))
else
  log "runtime workbench skipped, not found: $RUNTIME_ROOT/tools/workbench-web"
fi

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "function uploadFormDataWithProgress" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "云端确认" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WORKBENCH_DIR/workbench-engine.js"; then
  run_sudo grep -Fq "phase: 'confirming'" "$WORKBENCH_DIR/workbench-engine.js"
fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  run_sudo grep -Fq "function requestFormDataWithProgress" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "markReferenceUploadConfirming" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"; then
  run_sudo grep -Fq "progressLabel='云端确认" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
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
