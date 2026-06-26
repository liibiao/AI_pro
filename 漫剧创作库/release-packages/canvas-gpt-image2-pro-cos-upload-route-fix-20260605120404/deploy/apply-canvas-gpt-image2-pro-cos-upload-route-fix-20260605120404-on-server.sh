#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-gpt-image2-pro-cos-upload-route-fix-20260605120404"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
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
  if ! run_sudo test -f "$dest"; then
    log "skip $label, target not found: $dest"
    return 0
  fi
  install_file "$src" "$dest" "$label"
}

patch_platform_upstream_timeout_file(){
  local file="$1"
  run_sudo test -f "$file" || return 0
  run_sudo grep -Eq "上游请求超时|120000ms" "$file" || return 0
  run_sudo grep -Fq "120000" "$file" || return 0
  backup_file "$file"
  run_sudo perl -0pi -e 's/120000/900000/g' "$file"
  log "patched upstream timeout marker in $file"
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

verify_package_markers(){
  log "verify package markers"
  grep -Fq "function gptImage2ProConfiguredUploadMode" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "function generationTaskUploadModeForModel" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "return !!serverPublicAssetUrl(ref)||(isHttpUrl(ref)&&!isLocalWorkbenchUrl(ref));" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "if(serverPublicAssetUrl(ref))return false;" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "if(isGptImage2ProModel(model))return 'object_storage';" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "function normalizeUploadModeOrEmpty" "$SRC/workbench-web/canvas-next/generation-service.js"
  grep -Fq "const gptImage2UploadMode=normalizeUploadModeOrEmpty" "$SRC/workbench-web/canvas-next/generation-service.js"
  grep -Fq "form.append('uploadMode',mode)" "$SRC/workbench-web/canvas-next/generation-service.js"
  grep -Fq "\"uploadMode\": \"object_storage\"" "$SRC/workbench-web/models/gpt-image-2.json"
  grep -Fq "provider_next" "$SRC/tools/workbench_server.py"
  grep -Fq "configuredUploadMode" "$SRC/smart-vision/app/scripts/bridge-server.mjs"
  grep -Fq "isCanvasGptImage2ProGenerationHint" "$SRC/api-server/dist/modules/generation/routes.js"
  grep -Fq "resolveOpenAiEditsEndpoint" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
  grep -Fq "uploadMode: 'object_storage'" "$SRC/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs"
  grep -Fq "openai-edits /images/edits object_storage" "$SRC/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs"
}

verify_api_markers(){
  local api_dir="$1"
  run_sudo grep -Fq "isCanvasGptImage2ProGenerationHint" "$api_dir/dist/modules/generation/routes.js"
  run_sudo grep -Fq "resolveOpenAiEditsEndpoint" "$api_dir/dist/modules/generation/adapters/registry.js"
  run_sudo grep -Fq "uploadMode: 'object_storage'" "$api_dir/scripts/fix-canvas-gpt-image2-pro-route.mjs"
}

verify_workbench_markers(){
  local dir="$1"
  run_sudo test -f "$dir/image-studio-canvas-next.html" || return 0
  run_sudo grep -Fq "function gptImage2ProConfiguredUploadMode" "$dir/image-studio-canvas-next.html"
  run_sudo grep -Fq "return !!serverPublicAssetUrl(ref)||(isHttpUrl(ref)&&!isLocalWorkbenchUrl(ref));" "$dir/image-studio-canvas-next.html"
  run_sudo grep -Fq "function normalizeUploadModeOrEmpty" "$dir/canvas-next/generation-service.js"
  run_sudo grep -Fq "\"uploadMode\": \"object_storage\"" "$dir/models/gpt-image-2.json"
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

pm2_jlist(){
  pm2_run jlist 2>/dev/null || true
}

api_dir_has_generation_routes(){
  local dir="$1"
  [ -n "$dir" ] || return 1
  [ -f "$dir/dist/modules/generation/routes.js" ] || return 1
  [ -f "$dir/dist/modules/generation/adapters/registry.js" ] || return 1
}

print_api_dir_if_valid(){
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  if api_dir_has_generation_routes "$candidate"; then
    printf '%s' "$candidate"
    return 0
  fi
  if api_dir_has_generation_routes "$candidate/api-server"; then
    printf '%s' "$candidate/api-server"
    return 0
  fi
  return 1
}

find_api_dir(){
  local found candidate pm2_cwd
  for candidate in "${API_DIR:-}" "${APP_DIR:-}" "${APP_DIR:-}/api-server"; do
    found="$(print_api_dir_if_valid "$candidate" || true)"
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
  done

  if command -v node >/dev/null 2>&1; then
    pm2_cwd="$(pm2_jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s||'[]');const p=a.find(x=>x.name===process.env.PM2_APP)||a.find(x=>x.name==='ai-admin-api');process.stdout.write(p?.pm2_env?.pm_cwd||'')}catch(e){}})" || true)"
    found="$(print_api_dir_if_valid "$pm2_cwd" || true)"
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
  fi

  local candidates=(
    "$MIRROR_TARGET/../后台管理系统/api-server"
    "$MIRROR_TARGET/api-server"
    "/home/ubuntu/后台管理系统/api-server"
    "/home/ubuntu/AI_pro/后台管理系统/api-server"
    "/var/www/ai-admin/ai-admin-platform/api-server"
    "/var/www/ai-admin-platform/api-server"
    "/var/www/后台管理系统/api-server"
    "/opt/后台管理系统/api-server"
    "/opt/ai-admin-platform/api-server"
  )
  for candidate in "${candidates[@]}"; do
    found="$(print_api_dir_if_valid "$candidate" || true)"
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
  done
  return 1
}

install_api_server_files(){
  local api_dir="$1"
  log "install api-server route fix: $api_dir"
  install_file "$SRC/api-server/src/modules/generation/routes.ts" "$api_dir/src/modules/generation/routes.ts" "api generation routes source"
  install_file "$SRC/api-server/src/modules/generation/adapters/registry.ts" "$api_dir/src/modules/generation/adapters/registry.ts" "api generation registry source"
  install_file "$SRC/api-server/dist/modules/generation/routes.js" "$api_dir/dist/modules/generation/routes.js" "api generation routes dist"
  install_file "$SRC/api-server/dist/modules/generation/adapters/registry.js" "$api_dir/dist/modules/generation/adapters/registry.js" "api generation registry dist"
  install_file "$SRC/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs" "$api_dir/scripts/fix-canvas-gpt-image2-pro-route.mjs" "api gpt-image2 route db fix"
}

restore_packaged_api_dist(){
  local api_dir="$1"
  install_file "$SRC/api-server/dist/modules/generation/routes.js" "$api_dir/dist/modules/generation/routes.js" "api generation routes packaged dist"
  install_file "$SRC/api-server/dist/modules/generation/adapters/registry.js" "$api_dir/dist/modules/generation/adapters/registry.js" "api generation registry packaged dist"
}

build_api_if_possible(){
  local api_dir="$1"
  [ "${API_BUILD:-auto}" != "0" ] || { log "api build skipped by API_BUILD=0"; return 0; }
  [ -f "$api_dir/package.json" ] || { log "api build skipped, package.json not found"; return 0; }

  if command -v npm >/dev/null 2>&1; then
    log "build api-server with npm run build"
    if (cd "$api_dir" && npm run build); then return 0; fi
    log "api build failed; restoring packaged dist"
    restore_packaged_api_dist "$api_dir"
    return 0
  fi

  if command -v node >/dev/null 2>&1 && [ -f "$api_dir/node_modules/typescript/bin/tsc" ]; then
    log "build api-server with local TypeScript"
    if (cd "$api_dir" && node node_modules/typescript/bin/tsc -p tsconfig.json); then return 0; fi
    log "api TypeScript build failed; restoring packaged dist"
    restore_packaged_api_dist "$api_dir"
    return 0
  fi

  log "api build skipped, npm/tsc not available; using packaged dist"
}

run_db_route_fix(){
  local api_dir="$1"
  if [ "${SKIP_DB_FIX:-0}" = "1" ]; then
    log "db route fix skipped by SKIP_DB_FIX=1"
    return 0
  fi
  command -v node >/dev/null 2>&1 || fail "node not found; cannot run DB route fix"
  log "fix GPT-Image2 Pro provider/model route in database to object_storage"
  (cd "$api_dir" && node scripts/fix-canvas-gpt-image2-pro-route.mjs)
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

verify_package_markers

API_TARGET_DIR="$(find_api_dir || true)"
[ -n "$API_TARGET_DIR" ] || fail "ai-admin-api directory not found. Set API_DIR=/path/to/api-server or APP_DIR=/path/to/admin-app and rerun."

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install public workbench: $WORKBENCH_DIR"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
install_file "$SRC/workbench-web/models/gpt-image-2.json" "$WORKBENCH_DIR/models/gpt-image-2.json" "public gpt-image-2 model"

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
  install_file "$SRC/tools/workbench-web/models/gpt-image-2.json" "$MIRROR_TARGET/tools/workbench-web/models/gpt-image-2.json" "mirror gpt-image-2 model"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  log "install legacy canvas-next workbench"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy generation service"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/gpt-image-2.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/gpt-image-2.json" "legacy gpt-image-2 model"
else
  log "legacy workbench skipped, not found: $MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web"
fi

install_optional_existing "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/tools/runninghub_client.py" "$MIRROR_TARGET/tools/runninghub_client.py" "mirror RunningHub client"
install_optional_existing "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart image backend"
install_optional_existing "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
install_optional_existing "$SRC/smart-vision/app/scripts/bridge-server.mjs" "$MIRROR_TARGET/smart-vision/app/scripts/bridge-server.mjs" "smart vision bridge server"

install_api_server_files "$API_TARGET_DIR"
build_api_if_possible "$API_TARGET_DIR"
verify_api_markers "$API_TARGET_DIR"
run_db_route_fix "$API_TARGET_DIR"

patch_platform_upstream_timeout_defaults

log "verify installed workbench markers"
verify_workbench_markers "$WORKBENCH_DIR"
if run_sudo test -d "$MIRROR_TARGET/tools/workbench-web"; then verify_workbench_markers "$MIRROR_TARGET/tools/workbench-web"; fi

RESTARTED=0
for name in "$PM2_APP" ai-admin-api workbench-server smart-vision-workbench smart-vision-bridge; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart ai-admin-api/workbench service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
