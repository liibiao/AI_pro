#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt2-lowcost-base64-freeze-fix-20260624120621"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
RUNTIME_WORKBENCH_DIR="${RUNTIME_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return "$status"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_NAME" >/dev/null 2>&1; then
    pm2 "$@"
  elif [ "${DEPLOY_USE_SUDO:-auto}" != "never" ] && command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

verify_api_routes_markers(){
  local file="$1"
  grep -Fq "sanitizeGenerationTaskResponse" "$file"
  grep -Fq "sanitizeGenerationTaskDetailItem(task" "$file"
  grep -Fq "server_async_object_storage" "$file"
  grep -Fq "124异步转存cos" "$file"
}

verify_api_adapter_markers(){
  local file="$1"
  grep -Fq "resolveAiyunzhiGptImage2ResponseFormat" "$file"
  grep -Fq "server_async_object_storage') return 'url'" "$file"
  grep -Fq "if (responseType === 'server_async_object_storage')" "$file"
  grep -Fq "if (directUrl && !/^data:image\\//i.test(directUrl)) return directUrl" "$file"
}

verify_canvas_markers(){
  local file="$1"
  grep -Fq "allowInlineDataResult" "$file"
  grep -Fq "compactGenerationRawTask" "$file"
  grep -Fq "rawTask=compactGenerationRawTask" "$file"
  grep -Fq "server_async_object_storage" "$file"
  grep -Fq "124异步转存cos" "$file"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC_APP="$WORKDIR/ai-admin-platform"
SRC_WORKBENCH="$WORKDIR/workbench-web"
SRC_TOOLS="$WORKDIR/tools/workbench-web"
SRC_MIRROR="$WORKDIR/mirror-workbench-web"

REQUIRED_FILES=(
  "$SRC_APP/api-server/src/modules/generation/routes.ts"
  "$SRC_APP/api-server/dist/modules/generation/routes.js"
  "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts"
  "$SRC_APP/api-server/dist/modules/generation/adapters/registry.js"
  "$SRC_WORKBENCH/image-studio-canvas-next.html"
  "$SRC_WORKBENCH/canvas-next/generation-service.js"
  "$SRC_TOOLS/image-studio-canvas-next.html"
  "$SRC_TOOLS/canvas-next/generation-service.js"
  "$SRC_MIRROR/image-studio-canvas-next.html"
  "$SRC_MIRROR/canvas-next/generation-service.js"
)
for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || fail "missing package file: $file"
done

log "verify package markers"
verify_api_routes_markers "$SRC_APP/api-server/src/modules/generation/routes.ts"
verify_api_routes_markers "$SRC_APP/api-server/dist/modules/generation/routes.js"
verify_api_adapter_markers "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts"
verify_canvas_markers "$SRC_WORKBENCH/image-studio-canvas-next.html"
verify_canvas_markers "$SRC_TOOLS/image-studio-canvas-next.html"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/workbench-web/canvas-next" \
  "$BACKUP_DIR/tools/workbench-web/canvas-next" \
  "$BACKUP_DIR/mirror-workbench-web/canvas-next" \
  "$BACKUP_DIR/runtime-workbench-web/canvas-next" \
  "$BACKUP_DIR/root"

run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/root/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js" "$BACKUP_DIR/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
run_sudo cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/mirror-workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
run_sudo cp -a "$RUNTIME_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/runtime-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$RUNTIME_WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/runtime-workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

log "install api files"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation"
run_sudo cp -a "$SRC_APP/api-server/src/modules/generation/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/generation/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo cp -a "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

if [ -f "$REMOTE_APP_ROOT/api-server/node_modules/typescript/bin/tsc" ]; then
  log "compile api"
  ( cd "$REMOTE_APP_ROOT/api-server" && node node_modules/typescript/bin/tsc -p tsconfig.json )
fi

log "install workbench files"
if run_sudo test -d "$WORKBENCH_DIR"; then
  run_sudo mkdir -p "$WORKBENCH_DIR/canvas-next"
  run_sudo cp -a "$SRC_WORKBENCH/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_WORKBENCH/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -d "$REMOTE_ROOT"; then
  run_sudo cp -a "$SRC_WORKBENCH/image-studio-canvas-next.html" "$REMOTE_ROOT/image-studio-canvas-next.html"
fi
if run_sudo test -d "$REMOTE_APP_ROOT/tools/workbench-web"; then
  run_sudo mkdir -p "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next"
  run_sudo cp -a "$SRC_TOOLS/image-studio-canvas-next.html" "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_TOOLS/canvas-next/generation-service.js" "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js"
fi
if run_sudo test -d "$MIRROR_WORKBENCH_DIR"; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/canvas-next"
  run_sudo cp -a "$SRC_MIRROR/image-studio-canvas-next.html" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_MIRROR/canvas-next/generation-service.js" "$MIRROR_WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -d "$RUNTIME_WORKBENCH_DIR"; then
  run_sudo mkdir -p "$RUNTIME_WORKBENCH_DIR/canvas-next"
  run_sudo cp -a "$SRC_MIRROR/image-studio-canvas-next.html" "$RUNTIME_WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_MIRROR/canvas-next/generation-service.js" "$RUNTIME_WORKBENCH_DIR/canvas-next/generation-service.js"
fi

log "verify installed markers"
verify_api_routes_markers "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
verify_api_adapter_markers "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_canvas_markers "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$REMOTE_ROOT/image-studio-canvas-next.html"; then
  verify_canvas_markers "$REMOTE_ROOT/image-studio-canvas-next.html"
fi

log "restart api"
if pm2_run restart "$PM2_NAME" --update-env; then
  pm2_run save || true
else
  log "pm2 restart skipped; please restart $PM2_NAME manually"
fi

log "done. backup=$BACKUP_DIR"
