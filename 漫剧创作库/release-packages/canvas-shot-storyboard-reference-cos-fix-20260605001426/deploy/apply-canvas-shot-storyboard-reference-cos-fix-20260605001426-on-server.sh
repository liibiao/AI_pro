#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-shot-storyboard-reference-cos-fix-20260605001426"
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
  log "installed $dest"
}
patch_platform_upstream_timeout_file(){
  local file="$1"
  run_sudo test -f "$file" || return 0
  run_sudo grep -Eq "上游请求超时|120000ms" "$file" || return 0
  run_sudo grep -Fq "120000" "$file" || return 0
  backup_file "$file"
  run_sudo perl -0pi -e 's/120000/900000/g' "$file"
  log "patched platform upstream timeout marker in $file"
}
patch_platform_upstream_timeout_defaults(){
  local root file
  for root in "$WEB_ROOT" "$MIRROR_TARGET" ${PLATFORM_API_DIRS:-}; do
    [ -n "$root" ] || continue
    [ -d "$root" ] || continue
    while IFS= read -r file; do
      patch_platform_upstream_timeout_file "$file"
    done < <(find "$root" -maxdepth 8 -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' -o -name '*.json' \) -not -path '*/node_modules/*' -not -path '*/.deploy-backups/*' 2>/dev/null | head -2000)
  done
}
verify_canvas_markers(){
  local file="$1"
  grep -Fq "const GENERATION_TASK_SUBMIT_TIMEOUT_MS=900000" "$file"
  grep -Fq "const GENERATION_TASK_QUERY_TIMEOUT_MS=900000" "$file"
  grep -Fq "const GENERATION_TASK_RECOVERY_MAX_MS=900000" "$file"
  grep -Fq "X-Upstream-Timeout-Ms" "$file"
  grep -Fq "X-Request-Timeout-Ms" "$file"
  grep -Fq "queryTimeoutMs" "$file"
  grep -Fq "generationTaskQueryOptions" "$file"
  grep -Fq "generationTaskTimeoutFields(GENERATION_TASK_SUBMIT_TIMEOUT_MS)" "$file"
  grep -Fq "waitForNodeCosUpload(id,{timeout=300000" "$file"
  grep -Fq "connectMultiSelectedNodesToTarget" "$file"
  grep -Fq "textPrompt:{cat:'input',name:'文本节点'" "$file"
  grep -Fq ".node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-chip-close{right:3px!important;top:3px!important}" "$file"
  grep -Fq ".node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-add-chip,.node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-chip{flex:0 0 58px!important;width:58px!important;height:66px!important;min-height:66px!important;margin:0!important;padding:0!important;display:block!important;border-radius:11px!important;overflow:visible!important;opacity:1!important;transform:none!important}" "$file"
  grep -Fq "function shouldSuppressPromptZoomChipHoverPreview" "$file"
  grep -Fq "if(shouldSuppressPromptZoomChipHoverPreview(chip)){hidePromptZoomChipPreview(nodeId,group);return;}" "$file"
  grep -Fq "function promptExecutableImageRefs" "$file"
  grep -Fq "function shotStoryboardReferencedImages" "$file"
  grep -Fq "function nodeReferenceImageEntriesForUpload" "$file"
  grep -Fq "function scheduleNodeReferenceImagesCosUpload" "$file"
  grep -Fq "'shotStoryboard','textPrompt'" "$file"
  grep -Fq "shot-storyboard-img2img" "$file"
  grep -Fq "buildGeneratePayload(imageMode,model,params,positive,storyboardRefs)" "$file"
  grep -Fq "referenceImages:taskInputFiles" "$file"
  grep -Fq "images=shotStoryboardReferencedImages(n,uploadMode)" "$file"
}
verify_service_markers(){
  local file="$1"
  grep -Fq "const GENERATION_TASK_SUBMIT_TIMEOUT_MS=900000" "$file"
  grep -Fq "const GENERATION_TASK_QUERY_TIMEOUT_MS=900000" "$file"
  grep -Fq "const GENERATION_TASK_RECOVERY_MAX_MS=900000" "$file"
  grep -Fq "X-Upstream-Timeout-Ms" "$file"
  grep -Fq "X-Request-Timeout-Ms" "$file"
  grep -Fq "queryTimeoutMs" "$file"
  grep -Fq "generationTaskQueryOptions" "$file"
  grep -Fq "generationTaskTimeoutFields(GENERATION_TASK_SUBMIT_TIMEOUT_MS)" "$file"
}
verify_python_backend_markers(){
  local file="$1"
  grep -Fq "timeout=900" "$file"
}
verify_runninghub_markers(){
  local file="$1"
  grep -Fq "urlopen(req, timeout=900)" "$file"
}
verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "const GENERATION_TASK_SUBMIT_TIMEOUT_MS=900000" "$file"
  run_sudo grep -Fq "const GENERATION_TASK_QUERY_TIMEOUT_MS=900000" "$file"
  run_sudo grep -Fq "const GENERATION_TASK_RECOVERY_MAX_MS=900000" "$file"
  run_sudo grep -Fq "X-Upstream-Timeout-Ms" "$file"
  run_sudo grep -Fq "X-Request-Timeout-Ms" "$file"
  run_sudo grep -Fq "queryTimeoutMs" "$file"
  run_sudo grep -Fq "generationTaskQueryOptions" "$file"
  run_sudo grep -Fq "generationTaskTimeoutFields(GENERATION_TASK_SUBMIT_TIMEOUT_MS)" "$file"
  run_sudo grep -Fq "waitForNodeCosUpload(id,{timeout=300000" "$file"
  run_sudo grep -Fq "connectMultiSelectedNodesToTarget" "$file"
  run_sudo grep -Fq "textPrompt:{cat:'input',name:'文本节点'" "$file"
  run_sudo grep -Fq ".node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-chip-close{right:3px!important;top:3px!important}" "$file"
  run_sudo grep -Fq ".node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-add-chip,.node.node-type-shotStoryboard .storygrid-ref-area .vn2-ref-chip{flex:0 0 58px!important;width:58px!important;height:66px!important;min-height:66px!important;margin:0!important;padding:0!important;display:block!important;border-radius:11px!important;overflow:visible!important;opacity:1!important;transform:none!important}" "$file"
  run_sudo grep -Fq "function shouldSuppressPromptZoomChipHoverPreview" "$file"
  run_sudo grep -Fq "if(shouldSuppressPromptZoomChipHoverPreview(chip)){hidePromptZoomChipPreview(nodeId,group);return;}" "$file"
  run_sudo grep -Fq "function promptExecutableImageRefs" "$file"
  run_sudo grep -Fq "function shotStoryboardReferencedImages" "$file"
  run_sudo grep -Fq "function nodeReferenceImageEntriesForUpload" "$file"
  run_sudo grep -Fq "function scheduleNodeReferenceImagesCosUpload" "$file"
  run_sudo grep -Fq "'shotStoryboard','textPrompt'" "$file"
  run_sudo grep -Fq "shot-storyboard-img2img" "$file"
  run_sudo grep -Fq "buildGeneratePayload(imageMode,model,params,positive,storyboardRefs)" "$file"
  run_sudo grep -Fq "referenceImages:taskInputFiles" "$file"
  run_sudo grep -Fq "images=shotStoryboardReferencedImages(n,uploadMode)" "$file"
}
verify_service_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "const GENERATION_TASK_SUBMIT_TIMEOUT_MS=900000" "$file"
  run_sudo grep -Fq "const GENERATION_TASK_QUERY_TIMEOUT_MS=900000" "$file"
  run_sudo grep -Fq "const GENERATION_TASK_RECOVERY_MAX_MS=900000" "$file"
  run_sudo grep -Fq "X-Upstream-Timeout-Ms" "$file"
  run_sudo grep -Fq "X-Request-Timeout-Ms" "$file"
  run_sudo grep -Fq "queryTimeoutMs" "$file"
  run_sudo grep -Fq "generationTaskQueryOptions" "$file"
  run_sudo grep -Fq "generationTaskTimeoutFields(GENERATION_TASK_SUBMIT_TIMEOUT_MS)" "$file"
}
verify_python_backend_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "timeout=900" "$file"
}
verify_runninghub_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "urlopen(req, timeout=900)" "$file"
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
verify_service_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_service_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_service_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_python_backend_markers "$SRC/tools/image_studio_backend.py"
verify_python_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_runninghub_markers "$SRC/tools/runninghub_client.py"
verify_python_backend_markers "$SRC/tools/workbench_server.py"
verify_python_backend_markers "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install public workbench: $WORKBENCH_DIR"
install_required "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
install_optional_existing "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_optional_existing "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  install_optional_existing "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi
if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next" ]; then
  log "install legacy canvas-next service"
  install_optional_existing "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy generation service"
else
  log "legacy canvas-next service skipped, not found: $MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next"
fi

install_optional_existing "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
install_optional_existing "$SRC/tools/runninghub_client.py" "$MIRROR_TARGET/tools/runninghub_client.py" "mirror RunningHub client"
install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart image backend"
install_optional_existing "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"

log "verify installed markers"
verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  verify_service_markers_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_canvas_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js"; then
  verify_service_markers_sudo "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"; then
  verify_service_markers_sudo "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
  verify_python_backend_markers_sudo "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/runninghub_client.py"; then
  verify_runninghub_markers_sudo "$MIRROR_TARGET/tools/runninghub_client.py"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
  verify_python_backend_markers_sudo "$MIRROR_TARGET/tools/workbench_server.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then
  verify_python_backend_markers_sudo "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"; then
  verify_python_backend_markers_sudo "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"
fi

patch_platform_upstream_timeout_defaults

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/tools/runninghub_client.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/runninghub_client.py")
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
  if [ "${#PY_FILES[@]}" -gt 0 ]; then
    python3 -m py_compile "${PY_FILES[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
  fi
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench; do
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
