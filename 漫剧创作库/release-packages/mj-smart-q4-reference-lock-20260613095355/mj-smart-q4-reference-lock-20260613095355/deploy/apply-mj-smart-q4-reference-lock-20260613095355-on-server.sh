#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-smart-q4-reference-lock-20260613095355"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

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
  if id www-data >/dev/null 2>&1 && [[ "$dest" == /var/www/* ]]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
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

verify_canvas_markers(){
  local file="$1"
  grep -Fq "function midjourneySmartQualityForVersion(version)" "$file"
  grep -Fq "midjourneySmartQualityForVersion(v.mjVersion||'v7')" "$file"
  grep -Fq "function applySmartMidjourneyI2iReferenceLock" "$file"
  grep -Fq "strict reference fidelity to" "$file"
  grep -Fq "当前所选版本支持 Q4 时一律优先 --q 4" "$file"
  grep -Fq "mjImageWeight:'3'" "$file"
  grep -Fq "mjStylize:'0'" "$file"
  grep -Fq "mjChaos:'0'" "$file"
  grep -Fq "mjQuality:'4'" "$file"
}

verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_canvas_markers); verify_canvas_markers \"\$0\"" "$file"
}

verify_skill_markers(){
  local file="$1"
  grep -Fq "当前所选模型版本支持 Q4 时必须优先" "$file"
  grep -Fq "图生图智能模式必须强参考一致性" "$file"
  grep -Fq "智能图生图默认强一致性" "$file"
  grep -Fq "图生图强参考一致性默认" "$file"
}

verify_skill_markers_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_skill_markers); verify_skill_markers \"\$0\"" "$file"
}

verify_server_markers(){
  local file="$1"
  grep -Fq "def _midjourney_smart_quality_for_params" "$file"
  grep -Fq -- "--niji 7 --q 4" "$file"
  grep -Fq -- "--v 7 --style raw --q 4" "$file"
}

verify_server_markers_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_server_markers); verify_server_markers \"\$0\"" "$file"
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

pm2_restart_if_exists(){
  local name="$1"
  pm2_run show "$name" >/dev/null 2>&1 || return 1
  log "restart pm2: $name"
  pm2_run restart "$name" --update-env >/dev/null
}

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
verify_skill_markers "$SRC/skills/midjourney-prompt-skill.md"
verify_server_markers "$SRC/tools/workbench_server.py"
verify_server_markers "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
install_file "$SRC/skills/midjourney-prompt-skill.md" "$MIRROR_TARGET/skills/midjourney-prompt-skill.md" "midjourney skill"
install_optional_existing "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
install_optional_existing "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
verify_canvas_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
verify_skill_markers_sudo "$MIRROR_TARGET/skills/midjourney-prompt-skill.md"
if run_sudo test -f "$MIRROR_TARGET/tools/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/tools/workbench_server.py"
fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"; then
  verify_server_markers_sudo "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py"
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart the backend/workbench service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
