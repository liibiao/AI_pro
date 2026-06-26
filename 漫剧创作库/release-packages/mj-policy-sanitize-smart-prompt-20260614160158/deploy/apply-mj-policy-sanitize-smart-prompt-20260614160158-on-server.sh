#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-policy-sanitize-smart-prompt-20260614160158"
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
  grep -Fq "MIDJOURNEY_POLICY_RISK_REPLACEMENTS" "$file"
  grep -Fq "sanitizeMidjourneyPolicyRiskPromptText" "$file"
  grep -Fq "提示词触发上游安全策略" "$file"
  grep -Fq "合规改写硬规则" "$file"
  grep -Fq "Niji7 在当前画布通道使用最小稳定参数集" "$file"
}
verify_skill_markers(){
  local file="$1"
  grep -Fq "Midjourney 社区策略高风险表达" "$file"
  grep -Fq "young adult" "$file"
  grep -Fq "不要把 \`teenage\`" "$file"
  grep -Fq "智能模式只生成 Imagine" "$file"
}
verify_backend_markers(){
  local file="$1"
  grep -Fq "_sanitize_midjourney_policy_risk_prompt" "$file"
  grep -Fq "_MIDJOURNEY_POLICY_RISK_REPLACEMENTS" "$file"
  grep -Fq "提示词触发上游安全策略" "$file"
  grep -Fq "iw_max = 2.0 if is_niji" "$file"
}
verify_server_markers(){
  local file="$1"
  grep -Fq "_sanitize_midjourney_policy_risk_prompt" "$file"
  grep -Fq "Avoid Midjourney policy-risk wording" "$file"
  grep -Fq "young adult" "$file"
  grep -Fq "run_smart_midjourney_prompt" "$file"
}
verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "MIDJOURNEY_POLICY_RISK_REPLACEMENTS" "$file"
  run_sudo grep -Fq "sanitizeMidjourneyPolicyRiskPromptText" "$file"
  run_sudo grep -Fq "提示词触发上游安全策略" "$file"
  run_sudo grep -Fq "合规改写硬规则" "$file"
}
verify_skill_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "Midjourney 社区策略高风险表达" "$file"
  run_sudo grep -Fq "young adult" "$file"
  run_sudo grep -Fq "不要把 \`teenage\`" "$file"
}
verify_backend_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "_sanitize_midjourney_policy_risk_prompt" "$file"
  run_sudo grep -Fq "_MIDJOURNEY_POLICY_RISK_REPLACEMENTS" "$file"
  run_sudo grep -Fq "提示词触发上游安全策略" "$file"
  run_sudo grep -Fq "iw_max = 2.0 if is_niji" "$file"
}
verify_server_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "_sanitize_midjourney_policy_risk_prompt" "$file"
  run_sudo grep -Fq "Avoid Midjourney policy-risk wording" "$file"
  run_sudo grep -Fq "run_smart_midjourney_prompt" "$file"
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
verify_backend_markers "$SRC/tools/image_studio_backend.py"
verify_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_server_markers "$SRC/tools/workbench_server.py"
verify_server_markers "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  INSTALLED=$((INSTALLED+1))
fi
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  install_file "$SRC/tools/workbench_server.py" "$MIRROR_ROOT/tools/workbench_server.py" "mirror tools workbench server"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror tools image backend"
  INSTALLED=$((INSTALLED+1))
fi
if run_sudo test -d "$MIRROR_ROOT/skills"; then
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$MIRROR_ROOT/skills/midjourney-prompt-skill.md" "mirror midjourney skill"
  INSTALLED=$((INSTALLED+1))
fi
if run_sudo test -d "$MIRROR_ROOT/smart-vision/services/workbench"; then
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_ROOT/smart-vision/services/workbench/workbench_server.py" "smart-vision workbench server"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
  INSTALLED=$((INSTALLED+1))
fi

RUNTIME_ROOT="$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
fi
if run_sudo test -d "$RUNTIME_ROOT/tools"; then
  install_file "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime tools workbench server"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime tools image backend"
fi
if run_sudo test -d "$RUNTIME_ROOT/skills"; then
  install_file "$SRC/skills/midjourney-prompt-skill.md" "$RUNTIME_ROOT/skills/midjourney-prompt-skill.md" "runtime midjourney skill"
fi
if run_sudo test -d "$RUNTIME_ROOT/smart-vision/services/workbench"; then
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$RUNTIME_ROOT/smart-vision/services/workbench/workbench_server.py" "runtime smart-vision workbench server"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$RUNTIME_ROOT/smart-vision/services/workbench/image_studio_backend.py" "runtime smart-vision image backend"
fi

[ "$INSTALLED" -gt 0 ] || fail "no install target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; fi
if run_sudo test -f "$MIRROR_ROOT/skills/midjourney-prompt-skill.md"; then verify_skill_markers_sudo "$MIRROR_ROOT/skills/midjourney-prompt-skill.md"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/image_studio_backend.py"; then verify_backend_markers_sudo "$MIRROR_ROOT/tools/image_studio_backend.py"; fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"; then verify_backend_markers_sudo "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"; fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench_server.py"; then verify_server_markers_sudo "$MIRROR_ROOT/tools/workbench_server.py"; fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/services/workbench/workbench_server.py"; then verify_server_markers_sudo "$MIRROR_ROOT/smart-vision/services/workbench/workbench_server.py"; fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart the backend/workbench service manually if it is long-running"
else
  pm2_run save >/dev/null 2>&1 || true
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
