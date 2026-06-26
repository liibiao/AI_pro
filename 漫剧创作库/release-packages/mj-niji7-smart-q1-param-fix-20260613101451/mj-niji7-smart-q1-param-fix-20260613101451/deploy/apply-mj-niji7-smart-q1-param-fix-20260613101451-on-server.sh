#!/usr/bin/env bash
set -Eeuo pipefail

PKG_NAME="mj-niji7-smart-q1-param-fix-20260613101451"
ARCHIVE="${1:-}"
REPO_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_ROOT="/var/www/ai-admin"
BACKUP_ROOT="$REPO_ROOT/.deploy-backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT
log(){ printf '[deploy] %s\n' "$*"; }

install_file(){
  local src="$1" dst="$2"
  [[ -f "$src" ]] || { log "missing package file: $src"; exit 1; }
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" ]]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$dst")"
    cp -p "$dst" "$BACKUP_ROOT/$dst"
  fi
  cp -p "$src" "$dst"
  log "installed $dst"
}

restart_pm2_if_present(){
  local name="$1"
  if command -v pm2 >/dev/null 2>&1 && pm2 describe "$name" >/dev/null 2>&1; then
    log "restart pm2: $name"
    pm2 restart "$name" --update-env >/dev/null
    return 0
  fi
  if id ubuntu >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    if sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe "$name" >/dev/null 2>&1; then
      log "restart ubuntu pm2: $name"
      sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart "$name" --update-env >/dev/null
      return 0
    fi
  fi
  return 1
}

[[ -f "$ARCHIVE" ]] || { log "missing archive: $ARCHIVE"; exit 1; }
tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG_NAME"

log "verify package markers"
for file in \
  "$SRC/workbench-web/image-studio-canvas-next.html" \
  "$SRC/tools/workbench-web/image-studio-canvas-next.html"; do
  [[ -f "$file" ]]
  grep -q "function midjourneyVersionIsNiji" "$file"
  grep -q "Niji 会固定使用 Q1" "$file"
  grep -q "Niji 版本固定使用 Q1" "$file"
  grep -q "if(midjourneyVersionIsNiji(version))return '1'" "$file"
done
for file in \
  "$SRC/tools/workbench_server.py" \
  "$SRC/smart-vision/services/workbench/workbench_server.py"; do
  [[ -f "$file" ]]
  grep -q 'return "1"' "$file"
  grep -q 'default_params = "--niji 7 --q 1"' "$file"
done

log "apply $PKG_NAME"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench_server.py" "$REPO_ROOT/tools/workbench_server.py"
install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$REPO_ROOT/smart-vision/services/workbench/workbench_server.py"

log "verify installed markers"
grep -q "function midjourneyVersionIsNiji" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "Niji 会固定使用 Q1" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q 'default_params = "--niji 7 --q 1"' "$REPO_ROOT/tools/workbench_server.py"
grep -q 'default_params = "--niji 7 --q 1"' "$REPO_ROOT/smart-vision/services/workbench/workbench_server.py"

restarted=0
for name in workbench-server manga-workbench smart-vision-workbench legacy-workbench studio-workbench ai-admin-api; do
  if restart_pm2_if_present "$name"; then
    restarted=1
  fi
done
if [[ "$restarted" == "0" ]]; then
  log "pm2 restart skipped; no known backend/workbench process found"
fi

log "done"
printf 'backup: %s\n' "$BACKUP_ROOT"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=20260613101451\n'
