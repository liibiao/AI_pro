#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="describe-textnode-array-fallback-20260615003019"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
PM2_USER="${PM2_USER:-ubuntu}"
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
  if command -v pm2 >/dev/null 2>&1; then
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
  grep -Fq "function midjourneyDescriptionsFromTask" "$file"
  grep -Fq "function llmContentToText" "$file"
  grep -Fq "function canvasAccountChatWithStringContentFallback" "$file"
  grep -Fq "上游不接受图文数组，已改用纯文本引用重试" "$file"
  grep -Fq "_promptAutofillSourceId='midjourney-describe'" "$file"
  grep -Fq "resolvePromptVisionImageUrls" "$file"
  grep -Fq "mimeValueRe" "$file"
  grep -Fq "rememberImageVisionDataUrlFromSource" "$file"
  grep -Fq "disallowStringContentFallback" "$file"
  grep -Fq "必须以这些图片为唯一视觉依据" "$file"
  grep -Fq "读取 COS 公网参考图地址" "$file"
}

verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function midjourneyDescriptionsFromTask" "$file"
  run_sudo grep -Fq "function llmContentToText" "$file"
  run_sudo grep -Fq "function canvasAccountChatWithStringContentFallback" "$file"
  run_sudo grep -Fq "上游不接受图文数组，已改用纯文本引用重试" "$file"
  run_sudo grep -Fq "_promptAutofillSourceId='midjourney-describe'" "$file"
  run_sudo grep -Fq "resolvePromptVisionImageUrls" "$file"
  run_sudo grep -Fq "mimeValueRe" "$file"
  run_sudo grep -Fq "rememberImageVisionDataUrlFromSource" "$file"
  run_sudo grep -Fq "disallowStringContentFallback" "$file"
  run_sudo grep -Fq "必须以这些图片为唯一视觉依据" "$file"
  run_sudo grep -Fq "读取 COS 公网参考图地址" "$file"
}

verify_bridge_markers(){
  local file="$1"
  grep -Fq "function chatContentHasArray" "$file"
  grep -Fq "function chatContentArraySchemaError" "$file"
  grep -Fq "async function postBridgeChatCompletion" "$file"
  grep -Fq "usedStringContentFallback" "$file"
  grep -Fq "disallowStringContentFallback" "$file"
}

verify_bridge_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function chatContentHasArray" "$file"
  run_sudo grep -Fq "function chatContentArraySchemaError" "$file"
  run_sudo grep -Fq "async function postBridgeChatCompletion" "$file"
  run_sudo grep -Fq "usedStringContentFallback" "$file"
  run_sudo grep -Fq "disallowStringContentFallback" "$file"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_bridge_markers "$SRC/smart-vision/app/scripts/bridge-server.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  INSTALLED=$((INSTALLED+1))
fi
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  INSTALLED=$((INSTALLED+1))
fi
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
  INSTALLED=$((INSTALLED+1))
fi

BRIDGE_INSTALLED=0
if run_sudo test -d "$MIRROR_ROOT/smart-vision/app/scripts"; then
  install_file "$SRC/smart-vision/app/scripts/bridge-server.mjs" "$MIRROR_ROOT/smart-vision/app/scripts/bridge-server.mjs" "smart-vision bridge server"
  BRIDGE_INSTALLED=1
fi

[ "$INSTALLED" -gt 0 ] || fail "no canvas install target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; fi
if run_sudo test -f "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then verify_html_markers_sudo "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html"; fi
if [ "$BRIDGE_INSTALLED" -eq 1 ]; then verify_bridge_markers_sudo "$MIRROR_ROOT/smart-vision/app/scripts/bridge-server.mjs"; fi

RESTARTED=0
if [ "$BRIDGE_INSTALLED" -eq 1 ]; then
  for name in smart-vision-bridge ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
    if pm2_restart_if_exists "$name"; then
      RESTARTED=1
    fi
  done
fi
if [ "$RESTARTED" -eq 1 ]; then
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
