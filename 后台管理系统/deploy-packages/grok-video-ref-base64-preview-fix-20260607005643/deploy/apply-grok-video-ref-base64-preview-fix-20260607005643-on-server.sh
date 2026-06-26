#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-video-ref-base64-preview-fix-20260607005643"
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
  run_sudo chmod 0644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "${dest#/var/www}" != "$dest" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}

api_dir_has_registry(){
  local dir="$1"
  [ -n "$dir" ] || return 1
  [ -f "$dir/src/modules/generation/adapters/registry.ts" ] || return 1
  [ -f "$dir/dist/modules/generation/adapters/registry.js" ] || return 1
}

print_api_dir_if_valid(){
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  if api_dir_has_registry "$candidate"; then
    printf '%s' "$candidate"
    return 0
  fi
  if api_dir_has_registry "$candidate/api-server"; then
    printf '%s' "$candidate/api-server"
    return 0
  fi
  return 1
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

pm2_jlist(){ pm2_run jlist 2>/dev/null || true; }

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
  for candidate in \
    "$MIRROR_TARGET/../后台管理系统/api-server" \
    "$MIRROR_TARGET/api-server" \
    "/home/ubuntu/后台管理系统/api-server" \
    "/home/ubuntu/AI_pro/后台管理系统/api-server" \
    "/var/www/ai-admin/ai-admin-platform/api-server" \
    "/var/www/ai-admin-platform/api-server" \
    "/opt/ai-admin-platform/api-server"; do
    found="$(print_api_dir_if_valid "$candidate" || true)"
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
  done
  return 1
}

verify_html(){
  local file="$1"
  grep -Fq "tapnow-rewrite.css?v=20260607-grok-video-ref-fail-preview" "$file"
  grep -Fq "function grokVideoImageUrlToDataUrl" "$file"
  grep -Fq "function normalizeGrokVideoPayloadImageUrlsForSubmit" "$file"
  grep -Fq "function redactGenerationDebugPayload" "$file"
  grep -Fq "generationInputFileCandidateRefs(ref).some(candidate=>isDataMediaUrl(candidate))" "$file"
  grep -Fq "vn2-preview-failed" "$file"
}

verify_css(){
  local file="$1"
  grep -Fq ".vn2-preview-failed span" "$file"
}

verify_api(){
  local file="$1"
  grep -Fq "buildGrokVideoReferenceCandidates" "$file"
  grep -Fq "resolveGrokVideoReferenceUrls" "$file"
  grep -Fq "Grok 视频参考图必须是 HTTPS URL 或 base64 data URL" "$file"
}

verify_html_sudo(){
  local file="$1"
  run_sudo grep -Fq "tapnow-rewrite.css?v=20260607-grok-video-ref-fail-preview" "$file"
  run_sudo grep -Fq "function grokVideoImageUrlToDataUrl" "$file"
  run_sudo grep -Fq "function normalizeGrokVideoPayloadImageUrlsForSubmit" "$file"
  run_sudo grep -Fq "function redactGenerationDebugPayload" "$file"
  run_sudo grep -Fq "generationInputFileCandidateRefs(ref).some(candidate=>isDataMediaUrl(candidate))" "$file"
  run_sudo grep -Fq "vn2-preview-failed" "$file"
}

verify_css_sudo(){
  local file="$1"
  run_sudo grep -Fq ".vn2-preview-failed span" "$file"
}

verify_api_sudo(){
  local file="$1"
  run_sudo grep -Fq "buildGrokVideoReferenceCandidates" "$file"
  run_sudo grep -Fq "resolveGrokVideoReferenceUrls" "$file"
  run_sudo grep -Fq "Grok 视频参考图必须是 HTTPS URL 或 base64 data URL" "$file"
}

build_api_if_possible(){
  local api_dir="$1"
  [ "${API_BUILD:-auto}" != "0" ] || { log "api build skipped by API_BUILD=0"; return 0; }
  if run_sudo bash -lc "cd '$api_dir' && command -v npm >/dev/null 2>&1"; then
    log "build api-server with npm run build"
    if run_sudo bash -lc "cd '$api_dir' && npm run build"; then return 0; fi
    log "api npm build failed; keeping packaged dist"
    install_file "$SRC/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$api_dir/dist/modules/generation/adapters/registry.js" "api registry packaged dist"
    return 0
  fi
  if run_sudo bash -lc "cd '$api_dir' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
    log "build api-server with local TypeScript"
    if run_sudo bash -lc "cd '$api_dir' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then return 0; fi
    log "api TypeScript build failed; keeping packaged dist"
    install_file "$SRC/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$api_dir/dist/modules/generation/adapters/registry.js" "api registry packaged dist"
    return 0
  fi
  log "api build skipped, npm/tsc not available; using packaged dist"
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

log "verify package markers"
verify_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_css "$SRC/workbench-web/canvas-next/tapnow-rewrite.css"
verify_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_css "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"
verify_api "$SRC/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
verify_api "$SRC/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"

API_TARGET_DIR="$(find_api_dir || true)"
[ -n "$API_TARGET_DIR" ] || fail "api-server directory not found. Set API_DIR=/path/to/api-server and rerun."

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  install_file "$SRC/workbench-web/canvas-next/tapnow-rewrite.css" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css" "public canvas css"
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css" "mirror canvas css"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "install api-server registry: $API_TARGET_DIR"
install_file "$SRC/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$API_TARGET_DIR/src/modules/generation/adapters/registry.ts" "api registry source"
install_file "$SRC/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$API_TARGET_DIR/dist/modules/generation/adapters/registry.js" "api registry dist"
build_api_if_possible "$API_TARGET_DIR"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then verify_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"; then verify_css_sudo "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"; fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then verify_html_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css"; then verify_css_sudo "$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css"; fi
verify_api_sudo "$API_TARGET_DIR/src/modules/generation/adapters/registry.ts"
verify_api_sudo "$API_TARGET_DIR/dist/modules/generation/adapters/registry.js"

RESTARTED=0
for name in "$PM2_APP" ai-admin-api; do
  if pm2_restart_if_exists "$name"; then RESTARTED=1; fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart ai-admin-api manually if it is long-running"
else
  pm2_run save >/dev/null 2>&1 || true
fi

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
