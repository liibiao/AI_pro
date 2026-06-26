#!/usr/bin/env bash
set -Eeuo pipefail
PKG_NAME="mj-smart-dropdown-default-20260612164215"
ARCHIVE="${1:-}"
WORKDIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT
if [[ ! -f "$ARCHIVE" ]]; then
  printf '[deploy] missing archive: %s\n' "$ARCHIVE" >&2
  exit 1
fi
tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG_NAME"
REPO_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_ROOT="/var/www/ai-admin"
BACKUP_ROOT="$REPO_ROOT/.deploy-backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
log(){ printf '[deploy] %s\n' "$*"; }
install_file(){
  local src="$1" dst="$2"
  if [[ ! -f "$src" ]]; then log "missing package file: $src"; exit 1; fi
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" ]]; then mkdir -p "$BACKUP_ROOT/$(dirname "$dst")"; cp -p "$dst" "$BACKUP_ROOT/$dst"; fi
  cp -p "$src" "$dst"
  log "installed $dst"
}
log "apply $PKG_NAME"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/workbench-web/canvas-next/node-defs.js" "$PUBLIC_ROOT/workbench-web/canvas-next/node-defs.js"
install_file "$SRC/tools/workbench-web/canvas-next/node-defs.js" "$REPO_ROOT/tools/workbench-web/canvas-next/node-defs.js"
install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js"
log "verify markers"
grep -q "智能模式" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "MIDJOURNEY_SMART_PRESET_ID" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "useSmartMidjourneyPrompt" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "label:'智能MJ'" "$PUBLIC_ROOT/workbench-web/canvas-next/node-defs.js"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe ai-admin-api >/dev/null 2>&1; then log "restart pm2: ai-admin-api"; pm2 restart ai-admin-api --update-env >/dev/null; fi
fi
log "done"
printf 'backup: %s\n' "$BACKUP_ROOT"
printf 'Hard-refresh the canvas page after deploy.\n'
