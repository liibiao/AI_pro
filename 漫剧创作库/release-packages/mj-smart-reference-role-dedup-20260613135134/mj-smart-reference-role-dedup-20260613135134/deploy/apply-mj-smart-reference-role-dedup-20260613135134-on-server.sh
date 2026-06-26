#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-smart-reference-role-dedup-20260613135134"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
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
  grep -Fq "function buildSmartMidjourneyFinalPromptForNode" "$file"
  grep -Fq "stripSmartMidjourneyReferenceParams" "$file"
  grep -Fq "mjPromptImageUrls" "$file"
  grep -Fq "lockedAsCharacterOrStyle" "$file"
  grep -Fq "同一张参考图默认只承担一个主控制职责" "$file"
  grep -Fq "midjourneySupportsQuality4(version){return midjourneyMajorVersion(version)>=7;}" "$file"
}
verify_skill_markers(){
  local file="$1"
  grep -Fq "## 图生图参考图职责识别" "$file"
  grep -Fq "### 默认命令策略" "$file"
  grep -Fq '角色身份锁定：`--cref`' "$file"
  grep -Fq '风格锁定：`--sref`' "$file"
  grep -Fq "同一张图默认只承担一个主控制职责" "$file"
}
verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function buildSmartMidjourneyFinalPromptForNode" "$file"
  run_sudo grep -Fq "stripSmartMidjourneyReferenceParams" "$file"
  run_sudo grep -Fq "mjPromptImageUrls" "$file"
  run_sudo grep -Fq "lockedAsCharacterOrStyle" "$file"
  run_sudo grep -Fq "同一张参考图默认只承担一个主控制职责" "$file"
  run_sudo grep -Fq "midjourneySupportsQuality4(version){return midjourneyMajorVersion(version)>=7;}" "$file"
}
verify_skill_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "## 图生图参考图职责识别" "$file"
  run_sudo grep -Fq "### 默认命令策略" "$file"
  run_sudo grep -Fq '角色身份锁定：`--cref`' "$file"
  run_sudo grep -Fq '风格锁定：`--sref`' "$file"
  run_sudo grep -Fq "同一张图默认只承担一个主控制职责" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_skill_markers "$SRC/skills/midjourney-prompt-skill.md"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  log "install mirror tools: $MIRROR_ROOT"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  INSTALLED=$((INSTALLED+1))
else
  log "mirror tools skipped, not found: $MIRROR_ROOT/tools/workbench-web"
fi

if run_sudo test -d "$MIRROR_ROOT/skills"; then
  log "install mirror skill: $MIRROR_ROOT/skills"
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$MIRROR_ROOT/skills/midjourney-prompt-skill.md" "mirror midjourney skill"
  INSTALLED=$((INSTALLED+1))
else
  log "mirror skill skipped, not found: $MIRROR_ROOT/skills"
fi

RUNTIME_ROOT="$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
fi
if run_sudo test -d "$RUNTIME_ROOT/skills"; then
  log "install runtime skill mirror"
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$RUNTIME_ROOT/skills/midjourney-prompt-skill.md" "runtime midjourney skill"
fi

[ "$INSTALLED" -gt 0 ] || fail "no public, mirror or skill target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/skills/midjourney-prompt-skill.md"; then
  verify_skill_markers_sudo "$MIRROR_ROOT/skills/midjourney-prompt-skill.md"
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
pm2_run save >/dev/null 2>&1 || true

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
