#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aiyunzhi-gpt-image-2-full-chain-20260624031157"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
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

verify_api_markers(){
  local file="$1"
  grep -Fq "aiyunzhi-gpt-image-2" "$file"
  grep -Fq "/v1/images/generations" "$file"
  grep -Fq "/v1/images/edits" "$file"
  grep -Fq "gpt-image-2" "$file"
}

verify_canvas_markers(){
  local root="$1"
  grep -Fq '"adapter": "aiyunzhi-gpt-image-2"' "$root/models/aiyunzhi-gpt-image-2.json"
  grep -Fq '"model": "gpt-image-2"' "$root/models/aiyunzhi-gpt-image-2.json"
  grep -Fq '"/v1/images/generations"' "$root/models/aiyunzhi-gpt-image-2.json"
  grep -Fq '"/v1/images/edits"' "$root/models/aiyunzhi-gpt-image-2.json"
  grep -Fq 'aiyunzhi-gpt-image-2' "$root/model-registry.json"
  grep -Fq 'forceAiyunzhiGptImage2ModelConfig' "$root/canvas-next/generation-service.js"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC_APP="$WORKDIR/ai-admin-platform"
SRC_WORKBENCH="$WORKDIR/workbench-web"
SRC_MIRROR="$WORKDIR/mirror-workbench-web"

REQUIRED_FILES=(
  "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts"
  "$SRC_APP/api-server/dist/modules/generation/adapters/registry.js"
  "$SRC_APP/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts"
  "$SRC_APP/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js"
  "$SRC_APP/admin-web/src/main.tsx"
  "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2.json"
  "$SRC_WORKBENCH/canvas-next/generation-service.js"
  "$SRC_WORKBENCH/image-studio-canvas-next.html"
)
for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || fail "missing package file: $file"
done
[ -d "$SRC_APP/admin-web/dist" ] || fail "missing admin dist"

log "verify package markers"
verify_api_markers "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts"
verify_api_markers "$SRC_APP/api-server/dist/modules/generation/adapters/registry.js"
verify_api_markers "$SRC_APP/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts"
verify_api_markers "$SRC_APP/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js"
verify_canvas_markers "$SRC_WORKBENCH"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/workbench-web/models" \
  "$BACKUP_DIR/workbench-web/canvas-next" \
  "$BACKUP_DIR/mirror-workbench-web/models" \
  "$BACKUP_DIR/mirror-workbench-web/canvas-next" \
  "$BACKUP_DIR/tools"

run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/package.json" "$BACKUP_DIR/ai-admin-platform/api-server/package.json" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json" "$BACKUP_DIR/workbench-web/models/aiyunzhi-gpt-image-2.json" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/model-registry.json" "$BACKUP_DIR/workbench-web/model-registry.json" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/canvas-next/generator-adapters.js" "$BACKUP_DIR/workbench-web/canvas-next/generator-adapters.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas.html" "$BACKUP_DIR/workbench-web/image-studio-canvas.html" 2>/dev/null || true

log "install api/admin files"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters" "$REMOTE_APP_ROOT/api-server/src/modules/generation" "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat" "$REMOTE_APP_ROOT/api-server/src/modules/models"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters" "$REMOTE_APP_ROOT/api-server/dist/modules/generation" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat" "$REMOTE_APP_ROOT/api-server/dist/modules/models"
run_sudo cp -a "$SRC_APP/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
run_sudo cp -a "$SRC_APP/api-server/src/modules/generation/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo cp -a "$SRC_APP/api-server/src/modules/workbench-compat/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
run_sudo cp -a "$SRC_APP/api-server/src/modules/models/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo cp -a "$SRC_APP/api-server/src/sync-canvas-models.ts" "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts"
run_sudo cp -a "$SRC_APP/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" "$REMOTE_APP_ROOT/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/generation/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/workbench-compat/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
run_sudo cp -a "$SRC_APP/api-server/dist/modules/models/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo cp -a "$SRC_APP/api-server/dist/sync-canvas-models.js" "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js"
run_sudo cp -a "$SRC_APP/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" "$REMOTE_APP_ROOT/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js"
run_sudo cp -a "$SRC_APP/api-server/package.json" "$REMOTE_APP_ROOT/api-server/package.json"
run_sudo cp -a "$SRC_APP/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$SRC_APP/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "install workbench files"
if run_sudo test -d "$WORKBENCH_DIR"; then
  run_sudo mkdir -p "$WORKBENCH_DIR/models" "$WORKBENCH_DIR/canvas-next"
  run_sudo cp -a "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2.json" "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json"
  run_sudo cp -a "$SRC_WORKBENCH/model-registry.json" "$WORKBENCH_DIR/model-registry.json"
  run_sudo cp -a "$SRC_WORKBENCH/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js"
  run_sudo cp -a "$SRC_WORKBENCH/canvas-next/generator-adapters.js" "$WORKBENCH_DIR/canvas-next/generator-adapters.js"
  run_sudo cp -a "$SRC_WORKBENCH/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_WORKBENCH/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html"
fi
if run_sudo test -d "$REMOTE_APP_ROOT/tools"; then
  run_sudo mkdir -p "$REMOTE_APP_ROOT/tools/workbench-web/models" "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/models/aiyunzhi-gpt-image-2.json" "$REMOTE_APP_ROOT/tools/workbench-web/models/aiyunzhi-gpt-image-2.json"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/model-registry.json" "$REMOTE_APP_ROOT/tools/workbench-web/model-registry.json"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/canvas-next/generation-service.js" "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/canvas-next/generator-adapters.js" "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  run_sudo cp -a "$SRC_APP/tools/workbench-web/image-studio-canvas.html" "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas.html"
  run_sudo cp -a "$SRC_APP/tools/image_studio_backend.py" "$REMOTE_APP_ROOT/tools/image_studio_backend.py"
  run_sudo cp -a "$SRC_APP/tools/workbench_server.py" "$REMOTE_APP_ROOT/tools/workbench_server.py"
fi
if run_sudo test -d "$MIRROR_WORKBENCH_DIR"; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/models" "$MIRROR_WORKBENCH_DIR/canvas-next"
  run_sudo cp -a "$SRC_MIRROR/models/aiyunzhi-gpt-image-2.json" "$MIRROR_WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json"
  run_sudo cp -a "$SRC_MIRROR/model-registry.json" "$MIRROR_WORKBENCH_DIR/model-registry.json"
  run_sudo cp -a "$SRC_MIRROR/canvas-next/generation-service.js" "$MIRROR_WORKBENCH_DIR/canvas-next/generation-service.js"
  run_sudo cp -a "$SRC_MIRROR/canvas-next/generator-adapters.js" "$MIRROR_WORKBENCH_DIR/canvas-next/generator-adapters.js"
  run_sudo cp -a "$SRC_MIRROR/image-studio-canvas.html" "$MIRROR_WORKBENCH_DIR/image-studio-canvas.html"
fi

log "apply idempotent DB channel"
( cd "$REMOTE_APP_ROOT/api-server" && node dist/apply-aiyunzhi-gpt-image-2-channel.js )

log "verify installed markers"
verify_api_markers "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
if run_sudo test -d "$WORKBENCH_DIR"; then
  verify_canvas_markers "$WORKBENCH_DIR"
fi

log "restart api"
if pm2_run restart "$PM2_NAME" --update-env; then
  pm2_run save || true
else
  log "pm2 restart skipped; please restart $PM2_NAME manually"
fi

log "done. backup=$BACKUP_DIR"
