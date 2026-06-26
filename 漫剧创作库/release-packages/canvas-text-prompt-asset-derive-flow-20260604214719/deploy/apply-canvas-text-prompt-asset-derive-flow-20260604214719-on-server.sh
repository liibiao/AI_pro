#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-text-prompt-asset-derive-flow-20260604214719"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
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
install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  log "installed $dest"
}
verify_canvas_markers(){
  local file="$1"
  grep -Fq "ASSET_DERIVE_FLOW_OPTIONS" "$file"
  grep -Fq "推演资产 + 分镜表/分镜图 + 分镜参考/资产参考生视频提示词详情编辑页面 + 生视频节点" "$file"
  grep -Fq "function runAssetDeriveFlowPipeline" "$file"
  grep -Fq "function openAssetDeriveVideoConfirmModal" "$file"
  grep -Fq "data-asset-derive-flow" "$file"
  grep -Fq "GENERATION_TASK_RECOVERY_MAX_MS=600000" "$file"
  grep -Fq "recoverUnifiedGenerationTaskByClientRequestId(clientRequestId,{delay:2500,maxMs:GENERATION_TASK_RECOVERY_MAX_MS" "$file"
  grep -Fq '已按 clientRequestId 等待 ${Math.round(GENERATION_TASK_RECOVERY_MAX_MS/1000)} 秒仍未找到入库任务' "$file"
  grep -Fq "function promptReferenceUsesUnlimitedLimit" "$file"
  grep -Fq "function limitPromptReferenceItemsForNode" "$file"
  grep -Fq "shouldSuppressVn2ChipHoverPreview" "$file"
  grep -Fq "function resolveReferenceImagePayloadLimit" "$file"
  grep -Fq "params.maxReferenceImages=0" "$file"
}
verify_service_markers(){
  local file="$1"
  grep -Fq "GENERATION_TASK_RECOVERY_MAX_MS=600000" "$file"
  grep -Fq "recoverBackendGenerationTaskByClientRequestId(clientRequestId,{delay:2500,maxMs:GENERATION_TASK_RECOVERY_MAX_MS" "$file"
  grep -Fq '已按 clientRequestId 等待 ${Math.round(GENERATION_TASK_RECOVERY_MAX_MS/1000)} 秒仍未找到入库任务' "$file"
}
verify_canvas_markers_sudo(){ local file="$1"; run_sudo bash -c "$(declare -f verify_canvas_markers); verify_canvas_markers \"\$0\"" "$file"; }
verify_service_markers_sudo(){ local file="$1"; run_sudo bash -c "$(declare -f verify_service_markers); verify_service_markers \"\$0\"" "$file"; }

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

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$WORKBENCH_DIR/canvas-next/generation-service.js" ]; then
  verify_service_markers_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_canvas_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" ]; then
  verify_service_markers_sudo "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
