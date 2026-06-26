#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="text-agent-prompt-contract-20260616125341"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
API_DIR="${API_DIR:-$REMOTE_ROOT/ai-admin-platform/api-server}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

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
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  case "$dest" in
    /var/www/*)
      if id www-data >/dev/null 2>&1; then
        run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
      fi
      ;;
  esac
  log "installed $dest"
}

verify_html_markers(){
  local file="$1"
  grep -Fq "【文本节点执行任务】" "$file"
  grep -Fq "强约束：必须严格围绕“用户原始创意/输入内容”" "$file"
  grep -Fq "用户原始创意/输入内容" "$file"
  grep -Fq "taskInstruction:textPromptTaskInstruction" "$file"
  grep -Fq "outputContract:textPromptSystemInstruction" "$file"
}

verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "【文本节点执行任务】" "$file"
  run_sudo grep -Fq "强约束：必须严格围绕“用户原始创意/输入内容”" "$file"
  run_sudo grep -Fq "用户原始创意/输入内容" "$file"
  run_sudo grep -Fq "taskInstruction:textPromptTaskInstruction" "$file"
  run_sudo grep -Fq "outputContract:textPromptSystemInstruction" "$file"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_DIR" || fail "api dir not found: $API_DIR"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"
[ -f "$SRC/api-server/scripts/apply-text-agent-prompt-contract.mjs" ] || fail "package missing api patch script"
grep -Fq "硬性约束：必须严格围绕" "$SRC/api-server/scripts/apply-text-agent-prompt-contract.mjs"
grep -Fq "formatTextAgentUrls" "$SRC/api-server/scripts/apply-text-agent-prompt-contract.mjs"
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
run_sudo cp -p "$API_DIR/dist/modules/workbench/text-agent-routes.js" "$BACKUP_DIR/text-agent-routes.js.prev" 2>/dev/null || true

if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
fi
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
fi
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
fi

log "install api patch script"
run_sudo mkdir -p "$API_DIR/scripts"
run_sudo cp -p "$SRC/api-server/scripts/apply-text-agent-prompt-contract.mjs" "$API_DIR/scripts/apply-text-agent-prompt-contract.mjs"
run_sudo chmod 644 "$API_DIR/scripts/apply-text-agent-prompt-contract.mjs"

log "patch text-agent prompt contract"
(cd "$API_DIR" && node scripts/apply-text-agent-prompt-contract.mjs)
run_sudo node --check "$API_DIR/dist/modules/workbench/text-agent-routes.js"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; fi
run_sudo grep -Fq "taskInstruction: z.string().default" "$API_DIR/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "outputContract: z.string().default" "$API_DIR/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "硬性约束：必须严格围绕" "$API_DIR/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "用户原始创意/输入内容" "$API_DIR/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "function formatTextAgentUrls" "$API_DIR/dist/modules/workbench/text-agent-routes.js"
run_sudo grep -Fq "instructions: String(body?.outputContract || '').trim()" "$API_DIR/dist/modules/workbench/text-agent-routes.js"

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped, app not found: $PM2_APP"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
