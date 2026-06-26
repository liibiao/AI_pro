#!/usr/bin/env bash
set -Eeuo pipefail
PKG_NAME="mj-smart-wordlist-hints-20260612232408"
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
  if [[ -f "$dst" ]]; then mkdir -p "$BACKUP_ROOT/$(dirname "$dst")"; cp -p "$dst" "$BACKUP_ROOT/$dst"; fi
  cp -p "$src" "$dst"
  log "installed $dst"
}
[[ -f "$ARCHIVE" ]] || { log "missing archive: $ARCHIVE"; exit 1; }
tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG_NAME"
log "apply $PKG_NAME"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/skills/midjourney-prompt-skill.md" "$REPO_ROOT/skills/midjourney-prompt-skill.md"
log "verify markers"
grep -q "SMART_MJ_WORDLIST_IDS" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "collectSmartMidjourneyWordlistHints" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "漫剧创作库 / MJ 提示词库候选参考" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "词库只提供候选表达" "$REPO_ROOT/skills/midjourney-prompt-skill.md"
log "done"
printf 'backup: %s\n' "$BACKUP_ROOT"
printf 'Hard-refresh the canvas page after deploy.\n'
