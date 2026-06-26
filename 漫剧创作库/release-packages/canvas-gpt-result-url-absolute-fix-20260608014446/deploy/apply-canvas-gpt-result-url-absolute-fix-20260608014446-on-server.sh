#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-gpt-result-url-absolute-fix-20260608014446"
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
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_required(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo test -d "$(dirname "$dest")" || fail "$label destination directory not found: $(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}

install_optional_existing(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  if ! run_sudo test -f "$dest"; then
    log "skip $label, target not found: $dest"
    return 0
  fi
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  log "installed $dest"
}

verify_canvas_markers(){
  local file="$1"
  grep -Fq "function localizeBase64CanvasEntry" "$file"
  grep -Fq "function generationResultDownloadUrl" "$file"
  grep -Fq "function platformApiBase" "$file"
  grep -Fq "function platformApiUrl" "$file"
  grep -Fq "return platformApiUrl(ref)" "$file"
  grep -Fq "function ensureGeneratedEntryLocalPreview" "$file"
  grep -Fq "generationResultDownloadUrl(sourceUrl)" "$file"
  grep -Fq "!isServerGenerationResultUrl(url)" "$file"
  grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.objectStorageUrl,entry?.saved?.objectStorageUrl,entry?.previewUrl,entry?.localUrl" "$file"
  grep -Fq "function saveCanvasAfterMediaResult" "$file"
  grep -Fq "图片生成返回 base64，但本地预览保存失败" "$file"
  grep -Fq "分镜切割结果" "$file"
  grep -Fq "分镜合成结果" "$file"
  grep -Fq "白色画板预览" "$file"
  grep -Fq "function persistPendingDerivedImageLocalCopy" "$file"
  grep -Fq "写入本地预览" "$file"
  grep -Fq "ADAPTIVE_IMAGE_PLACEHOLDER" "$file"
  grep -Fq "data-adaptive-image" "$file"
  grep -Fq "settingsCursorEffectToggle" "$file"
  if grep -Fq "stage-cursor-field" "$file"; then fail "stage cursor CSS still exists in $file"; fi
  if grep -Fq "stageCursorField" "$file"; then fail "stage cursor canvas still exists in $file"; fi
  if grep -Fq "initStageCursorField" "$file"; then fail "stage cursor runtime still exists in $file"; fi
}

verify_server_markers(){
  local file="$1"
  grep -Fq "PREVIEW_PLACEHOLDER_PNG" "$file"
  grep -Fq "def preview_size_params" "$file"
  grep -Fq "data_url = str(payload.get(\"dataUrl\")" "$file"
  grep -Fq "if not remote_url and data_url:" "$file"
  grep -Fq "decode_data_url_to_bytes(data_url)" "$file"
  grep -Fq "data_url_reference_image" "$file"
}

verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function localizeBase64CanvasEntry" "$file"
  run_sudo grep -Fq "function generationResultDownloadUrl" "$file"
  run_sudo grep -Fq "function platformApiBase" "$file"
  run_sudo grep -Fq "function platformApiUrl" "$file"
  run_sudo grep -Fq "return platformApiUrl(ref)" "$file"
  run_sudo grep -Fq "function ensureGeneratedEntryLocalPreview" "$file"
  run_sudo grep -Fq "generationResultDownloadUrl(sourceUrl)" "$file"
  run_sudo grep -Fq "!isServerGenerationResultUrl(url)" "$file"
  run_sudo grep -Fq "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?.objectStorageUrl,entry?.saved?.objectStorageUrl,entry?.previewUrl,entry?.localUrl" "$file"
  run_sudo grep -Fq "function saveCanvasAfterMediaResult" "$file"
  run_sudo grep -Fq "图片生成返回 base64，但本地预览保存失败" "$file"
  run_sudo grep -Fq "分镜切割结果" "$file"
  run_sudo grep -Fq "分镜合成结果" "$file"
  run_sudo grep -Fq "白色画板预览" "$file"
  run_sudo grep -Fq "function persistPendingDerivedImageLocalCopy" "$file"
  run_sudo grep -Fq "写入本地预览" "$file"
  run_sudo grep -Fq "ADAPTIVE_IMAGE_PLACEHOLDER" "$file"
  run_sudo grep -Fq "data-adaptive-image" "$file"
  run_sudo grep -Fq "settingsCursorEffectToggle" "$file"
  if run_sudo grep -Fq "stage-cursor-field" "$file"; then fail "stage cursor CSS still exists in $file"; fi
  if run_sudo grep -Fq "stageCursorField" "$file"; then fail "stage cursor canvas still exists in $file"; fi
  if run_sudo grep -Fq "initStageCursorField" "$file"; then fail "stage cursor runtime still exists in $file"; fi
}

verify_server_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "PREVIEW_PLACEHOLDER_PNG" "$file"
  run_sudo grep -Fq "def preview_size_params" "$file"
  run_sudo grep -Fq "data_url = str(payload.get(\"dataUrl\")" "$file"
  run_sudo grep -Fq "if not remote_url and data_url:" "$file"
  run_sudo grep -Fq "decode_data_url_to_bytes(data_url)" "$file"
  run_sudo grep -Fq "data_url_reference_image" "$file"
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
verify_canvas_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_server_markers "$SRC/tools/workbench_server.py"
verify_server_markers "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_required "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_required "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_canvas_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/tools/workbench_server.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"
fi

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
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
echo "Hard-refresh the canvas page after deploy."
