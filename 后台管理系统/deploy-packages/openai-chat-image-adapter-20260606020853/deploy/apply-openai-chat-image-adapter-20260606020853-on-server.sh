#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="openai-chat-image-adapter-20260606020853"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
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
  run_sudo install -m 0644 "$src" "$dest"
  log "installed $dest"
}
verify_api_markers(){
  local root="$1"
  grep -Fq "'openai-chat-image': { submit: submitOpenAiChatImage }" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "async function submitOpenAiChatImage" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "function normalizeOpenAiChatImageToolSize" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "openai-chat-image" "$root/ai-admin-platform/api-server/src/modules/generation/routes.ts"
  grep -Fq "case 'openai-chat-image'" "$root/ai-admin-platform/api-server/src/modules/models/routes.ts"
  grep -Fq "case 'openai-chat-image': return '/v1/chat/completions';" "$root/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts"
  grep -Fq "adapter === 'openai-chat-image'" "$root/ai-admin-platform/api-server/src/sync-canvas-models.ts"
  grep -Fq "submitOpenAiChatImage" "$root/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
}
verify_canvas_markers(){
  local file="$1"
  grep -Fq "const OPENAI_CHAT_IMAGE_SIZE_RATIOS=['16:9','9:16','1:1'];" "$file"
  grep -Fq "function isOpenAiChatImageAdapter" "$file"
  grep -Fq "if(isOpenAiChatImageAdapter(adapter))payload.stream=false;" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

log "verify package markers"
verify_api_markers "$SRC_ROOT"
verify_canvas_markers "$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server files"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "api registry source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts" "generation routes source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts" "models routes source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts" "workbench compat source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts" "sync canvas models source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "api registry dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js" "generation routes dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js" "models routes dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js" "workbench compat dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js" "sync canvas models dist"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public canvas: $WORKBENCH_DIR"
  install_file "$SRC_ROOT/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
else
  log "public canvas skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror canvas: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
else
  log "mirror canvas skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "api registry dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js" "generation routes dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js" "models routes dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js" "workbench compat dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js" "sync canvas models dist"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "'openai-chat-image': { submit: submitOpenAiChatImage }" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "submitOpenAiChatImage" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "openai-chat-image" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "case 'openai-chat-image'" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "case 'openai-chat-image': return '/v1/chat/completions';" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
run_sudo grep -Fq "adapter === 'openai-chat-image'" "$APP_DIR/api-server/src/sync-canvas-models.ts"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "OPENAI_CHAT_IMAGE_SIZE_RATIOS" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "OPENAI_CHAT_IMAGE_SIZE_RATIOS" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "canvas refresh: http://124.156.137.236/workbench-web/image-studio-canvas-next.html"
