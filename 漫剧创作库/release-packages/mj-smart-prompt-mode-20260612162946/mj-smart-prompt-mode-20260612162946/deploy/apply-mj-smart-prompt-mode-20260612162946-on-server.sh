#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-smart-prompt-mode-20260612162946"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
APP_ROOT="${APP_ROOT:-$WEB_ROOT/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

run_sudo(){
  "$@" && return 0
  local code=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$code"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$code"
  fi
}

pm2_run(){
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 0
  if pm2_run show "$name" >/dev/null 2>&1; then
    log "restart pm2: $name"
    pm2_run restart "$name" --update-env >/dev/null
    return 0
  fi
  return 1
}

backup_path(){
  local dest="$1"
  run_sudo test -e "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -a "$dest" "$backup"
}

install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_path "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}

install_tree(){
  local src="$1" dest="$2" label="$3"
  [ -d "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_path "$dest"
  run_sudo rm -rf "$dest"
  run_sudo cp -a "$src" "$dest"
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown -R www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed tree $dest"
}

verify_markers(){
  grep -Fq "智能MJ" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "prepareSmartMidjourneyPromptForNode" "$SRC/workbench-web/image-studio-canvas-next.html"
  grep -Fq "smart-midjourney-prompt" "$SRC/workbench-web/canvas-next/generation-service.js"
  grep -Fq "MIDJOURNEY_PROMPT_SKILL_PATH" "$SRC/tools/workbench_server.py"
  grep -Fq "midjourney-prompt-skill" "$SRC/skills/midjourney-prompt-skill.md"
  grep -Fq "smart-midjourney-prompt" "$SRC/api-server/dist/modules/workbench-compat/routes.js"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_markers

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  for file in node-defs.js generator-adapters.js generation-service.js renderers.js styles.css; do
    install_file "$SRC/workbench-web/canvas-next/$file" "$WORKBENCH_DIR/canvas-next/$file" "public canvas-next $file"
  done
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools" ]; then
  log "install mirror tools: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  for file in node-defs.js generator-adapters.js generation-service.js renderers.js styles.css; do
    install_file "$SRC/tools/workbench-web/canvas-next/$file" "$MIRROR_TARGET/tools/workbench-web/canvas-next/$file" "mirror canvas-next $file"
  done
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$MIRROR_TARGET/skills/midjourney-prompt-skill.md" "midjourney prompt skill"
  install_tree "$SRC/wordlists/mj-image" "$MIRROR_TARGET/wordlists/mj-image" "midjourney wordlists"
fi

if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  for file in node-defs.js generator-adapters.js generation-service.js renderers.js styles.css; do
    install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/$file" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/$file" "smart legacy canvas-next $file"
  done
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools" ]; then
  log "install runtime legacy mirror"
  install_file "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  for file in node-defs.js generator-adapters.js generation-service.js renderers.js styles.css; do
    install_file "$SRC/tools/workbench-web/canvas-next/$file" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/$file" "runtime canvas-next $file"
  done
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$RUNTIME_ROOT/skills/midjourney-prompt-skill.md" "runtime midjourney prompt skill"
  install_tree "$SRC/wordlists/mj-image" "$RUNTIME_ROOT/wordlists/mj-image" "runtime midjourney wordlists"
fi

if [ -d "$APP_ROOT/api-server" ]; then
  log "install api-server route: $APP_ROOT/api-server"
  install_file "$SRC/api-server/src/modules/workbench-compat/routes.ts" "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "api workbench compat routes source"
  install_file "$SRC/api-server/dist/modules/workbench-compat/routes.js" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "api workbench compat routes dist"
  if run_sudo bash -lc "cd '$APP_ROOT/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
    if run_sudo bash -lc "cd '$APP_ROOT/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
      log "api-server build: ok"
    else
      log "api-server build failed; keep packaged dist routes.js"
      install_file "$SRC/api-server/dist/modules/workbench-compat/routes.js" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "api workbench compat routes dist restore"
    fi
  else
    log "api-server TypeScript toolchain not found; using packaged dist"
  fi
else
  log "api-server skipped, not found: $APP_ROOT/api-server"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "智能MJ" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench_server.py" ]; then
  run_sudo grep -Fq "MIDJOURNEY_PROMPT_SKILL_PATH" "$MIRROR_TARGET/tools/workbench_server.py"
fi
if [ -f "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" ]; then
  run_sudo grep -Fq "smart-midjourney-prompt" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
fi
if command -v python3 >/dev/null 2>&1; then
  py_files=()
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && py_files+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && py_files+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
  [ "${#py_files[@]}" -eq 0 ] || python3 -m py_compile "${py_files[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
fi

log "restart backend if pm2 process exists"
RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench legacy-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 1 ]; then
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped; restart the workbench/backend service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
