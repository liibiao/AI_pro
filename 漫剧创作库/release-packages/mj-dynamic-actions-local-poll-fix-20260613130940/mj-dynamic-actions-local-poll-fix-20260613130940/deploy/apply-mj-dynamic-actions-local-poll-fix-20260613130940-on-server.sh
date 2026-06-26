#!/usr/bin/env bash
set -Eeuo pipefail

PKG_NAME="mj-dynamic-actions-local-poll-fix-20260613130940"
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

[[ -f "$ARCHIVE" ]] || { log "missing archive: $ARCHIVE"; exit 1; }
tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG_NAME"

log "verify package markers"
for file in \
  "$SRC/workbench-web/image-studio-canvas-next.html" \
  "$SRC/tools/workbench-web/image-studio-canvas-next.html"; do
  [[ -f "$file" ]]
  grep -q "function midjourneyActionItemsForPage" "$file"
  grep -q "function midjourneyActionGroupsForItems" "$file"
  grep -q "data-mj-detail-custom-id" "$file"
  grep -q "data-mj-custom-id" "$file"
  grep -q "当前图片未同步到可执行的 MJ 功能" "$file"
  grep -q "_pollLocalOnly:true" "$file"
  grep -q "function isMidjourneyLocalPollOnlyGenerationTask" "$file"
done

for file in \
  "$SRC/workbench-web/canvas-next/generation-service.js" \
  "$SRC/tools/workbench-web/canvas-next/generation-service.js" \
  "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"; do
  [[ -f "$file" ]]
  grep -q "function isMidjourneyLocalPollOnlyTask" "$file"
  grep -q "const localPollOnly=!!task?._pollLocalOnly||isMidjourneyLocalPollOnlyTask(task)" "$file"
done

log "apply $PKG_NAME"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$PUBLIC_ROOT/workbench-web/canvas-next/generation-service.js"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$REPO_ROOT/tools/workbench-web/canvas-next/generation-service.js"
install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "verify installed markers"
grep -q "function midjourneyActionItemsForPage" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "function midjourneyActionGroupsForItems" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "data-mj-detail-custom-id" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "当前图片未同步到可执行的 MJ 功能" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "_pollLocalOnly:true" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "function isMidjourneyLocalPollOnlyTask" "$PUBLIC_ROOT/workbench-web/canvas-next/generation-service.js"
grep -q "const localPollOnly=!!task?._pollLocalOnly||isMidjourneyLocalPollOnlyTask(task)" "$PUBLIC_ROOT/workbench-web/canvas-next/generation-service.js"

log "done"
printf 'backup: %s\n' "$BACKUP_ROOT"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=20260613130940\n'
