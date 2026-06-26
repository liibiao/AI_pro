#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="hongniao-gpt2-generations-route-fix-20260624024632"
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

verify_registry(){
  local file="$1"
  grep -Fq "isHongniaoGptImage2GenerationRequest" "$file"
  grep -Fq "shouldUseGptImage2FullResolutionSuffixModel" "$file"
  grep -Fq "gpt-image-2(pro)" "$file"
  grep -Fq "/v1/images/generations" "$file"
}

verify_generation_routes(){
  local file="$1"
  grep -Fq "hongniaoai.com" "$file"
  grep -Fq "gpt-image-2(pro)" "$file"
  grep -Fq "openai-generations" "$file"
}

verify_compat_routes(){
  local file="$1"
  grep -Fq "openai-generations" "$file"
  grep -Fq "/images/generations" "$file"
}

verify_model_routes(){
  local file="$1"
  grep -Fq "openai-generations" "$file"
  grep -Fq "/v1/images/generations" "$file"
}

verify_admin(){
  local src="$1"
  local dist="$2"
  grep -Fq "openai-generations" "$src"
  grep -Fq "OpenAI 图片生成 /v1/images/generations" "$src"
  grep -Rqs "openai-generations" "$dist"
  grep -Rqs "/v1/images/generations" "$dist"
}

verify_canvas(){
  local file="$1"
  grep -Fq "assembleGptImage2ProGenerationModelName" "$file"
  grep -Fq "gpt-image-2(pro)" "$file"
  grep -Fq "openai-generations" "$file"
  grep -Fq "/v1/images/generations" "$file"
}

verify_python_tool(){
  local file="$1"
  grep -Fq "openai-generations" "$file"
  grep -Fq "gpt-image-2(pro)" "$file"
  grep -Fq "/v1/images/generations" "$file"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
MAIN_SRC_FILE="$(find "$WORKDIR" -path '*/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts' -print -quit)"
[ -n "$MAIN_SRC_FILE" ] || fail "package missing ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
SRC_ROOT="${MAIN_SRC_FILE%/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts}"
SRC_APP="$SRC_ROOT/ai-admin-platform"

API_REGISTRY_SRC="$SRC_APP/api-server/src/modules/generation/adapters/registry.ts"
API_REGISTRY_DIST="$SRC_APP/api-server/dist/modules/generation/adapters/registry.js"
GEN_ROUTES_SRC="$SRC_APP/api-server/src/modules/generation/routes.ts"
GEN_ROUTES_DIST="$SRC_APP/api-server/dist/modules/generation/routes.js"
COMPAT_ROUTES_SRC="$SRC_APP/api-server/src/modules/workbench-compat/routes.ts"
COMPAT_ROUTES_DIST="$SRC_APP/api-server/dist/modules/workbench-compat/routes.js"
MODEL_ROUTES_SRC="$SRC_APP/api-server/src/modules/models/routes.ts"
MODEL_ROUTES_DIST="$SRC_APP/api-server/dist/modules/models/routes.js"
ADMIN_MAIN_SRC="$SRC_APP/admin-web/src/main.tsx"
ADMIN_DIST="$SRC_APP/admin-web/dist"
CANVAS_NEXT_HTML="$SRC_APP/tools/workbench-web/image-studio-canvas-next.html"
CANVAS_LEGACY_HTML="$SRC_APP/tools/workbench-web/image-studio-canvas.html"
CANVAS_SERVICE_JS="$SRC_APP/tools/workbench-web/canvas-next/generation-service.js"
PY_IMAGE_BACKEND="$SRC_APP/tools/image_studio_backend.py"
PY_WORKBENCH_SERVER="$SRC_APP/tools/workbench_server.py"

REQUIRED_FILES=(
  "$API_REGISTRY_SRC"
  "$API_REGISTRY_DIST"
  "$GEN_ROUTES_SRC"
  "$GEN_ROUTES_DIST"
  "$COMPAT_ROUTES_SRC"
  "$COMPAT_ROUTES_DIST"
  "$MODEL_ROUTES_SRC"
  "$MODEL_ROUTES_DIST"
  "$ADMIN_MAIN_SRC"
  "$CANVAS_NEXT_HTML"
  "$CANVAS_LEGACY_HTML"
  "$CANVAS_SERVICE_JS"
  "$PY_IMAGE_BACKEND"
  "$PY_WORKBENCH_SERVER"
)
for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || fail "missing package file: $file"
done
[ -d "$ADMIN_DIST" ] || fail "missing package dir: $ADMIN_DIST"

log "verify package markers"
verify_registry "$API_REGISTRY_SRC"
verify_registry "$API_REGISTRY_DIST"
verify_generation_routes "$GEN_ROUTES_SRC"
verify_generation_routes "$GEN_ROUTES_DIST"
verify_compat_routes "$COMPAT_ROUTES_SRC"
verify_compat_routes "$COMPAT_ROUTES_DIST"
verify_model_routes "$MODEL_ROUTES_SRC"
verify_model_routes "$MODEL_ROUTES_DIST"
verify_admin "$ADMIN_MAIN_SRC" "$ADMIN_DIST"
verify_canvas "$CANVAS_NEXT_HTML"
verify_canvas "$CANVAS_SERVICE_JS"
verify_python_tool "$PY_IMAGE_BACKEND"
verify_python_tool "$PY_WORKBENCH_SERVER"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/canvas-next" \
  "$BACKUP_DIR/public-workbench/canvas-next" \
  "$BACKUP_DIR/mirror-workbench/canvas-next" \
  "$BACKUP_DIR/tools"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas.html" "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/image-studio-canvas.html" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js" "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/image_studio_backend.py" "$BACKUP_DIR/tools/image_studio_backend.py" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/tools/workbench_server.py" "$BACKUP_DIR/tools/workbench_server.py" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-workbench/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas.html" "$BACKUP_DIR/public-workbench/image-studio-canvas.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/public-workbench/canvas-next/generation-service.js" 2>/dev/null || true
if [ -d "$MIRROR_WORKBENCH_DIR" ]; then
  run_sudo cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench/image-studio-canvas-next.html" 2>/dev/null || true
  run_sudo cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas.html" "$BACKUP_DIR/mirror-workbench/image-studio-canvas.html" 2>/dev/null || true
  run_sudo cp -a "$MIRROR_WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/mirror-workbench/canvas-next/generation-service.js" 2>/dev/null || true
fi

log "install api modules"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat" \
  "$REMOTE_APP_ROOT/api-server/src/modules/models" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/models"
run_sudo install -m 0644 "$API_REGISTRY_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$GEN_ROUTES_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$COMPAT_ROUTES_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
run_sudo install -m 0644 "$MODEL_ROUTES_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$API_REGISTRY_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$GEN_ROUTES_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$COMPAT_ROUTES_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
run_sudo install -m 0644 "$MODEL_ROUTES_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"

log "install admin web"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/src" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo install -m 0644 "$ADMIN_MAIN_SRC" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "install workbench assets"
run_sudo mkdir -p "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next" "$WORKBENCH_DIR/canvas-next"
run_sudo install -m 0644 "$CANVAS_NEXT_HTML" "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
run_sudo install -m 0644 "$CANVAS_LEGACY_HTML" "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas.html"
run_sudo install -m 0644 "$CANVAS_SERVICE_JS" "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js"
run_sudo install -m 0644 "$CANVAS_NEXT_HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo install -m 0644 "$CANVAS_LEGACY_HTML" "$WORKBENCH_DIR/image-studio-canvas.html"
run_sudo install -m 0644 "$CANVAS_SERVICE_JS" "$WORKBENCH_DIR/canvas-next/generation-service.js"
if [ -d "$MIRROR_WORKBENCH_DIR" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/canvas-next"
  run_sudo install -m 0644 "$CANVAS_NEXT_HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo install -m 0644 "$CANVAS_LEGACY_HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas.html"
  run_sudo install -m 0644 "$CANVAS_SERVICE_JS" "$MIRROR_WORKBENCH_DIR/canvas-next/generation-service.js"
  log "updated mirror workbench assets"
fi

log "install optional python workbench tools"
if run_sudo test -d "$REMOTE_APP_ROOT/tools"; then
  run_sudo install -m 0644 "$PY_IMAGE_BACKEND" "$REMOTE_APP_ROOT/tools/image_studio_backend.py"
  run_sudo install -m 0644 "$PY_WORKBENCH_SERVER" "$REMOTE_APP_ROOT/tools/workbench_server.py"
else
  log "skip python tools: $REMOTE_APP_ROOT/tools not found"
fi

log "verify installed markers"
verify_registry "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
verify_registry "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
verify_generation_routes "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
verify_generation_routes "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
verify_compat_routes "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
verify_compat_routes "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
verify_model_routes "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
verify_model_routes "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
verify_admin "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/dist"
verify_canvas "$REMOTE_APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
verify_canvas "$REMOTE_APP_ROOT/tools/workbench-web/canvas-next/generation-service.js"
verify_canvas "$WORKBENCH_DIR/image-studio-canvas-next.html"
verify_canvas "$WORKBENCH_DIR/canvas-next/generation-service.js"

if command -v node >/dev/null 2>&1; then
  log "node syntax check"
  node --check "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
  node --check "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
  node --check "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
  node --check "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
  node --check "$WORKBENCH_DIR/canvas-next/generation-service.js"
else
  log "node not found; syntax check skipped"
fi

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/?v=$STAMP"
