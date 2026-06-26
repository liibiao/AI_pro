#!/usr/bin/env bash
set -Eeuo pipefail

PKG_NAME="mj-action-taskid-parent-fix-20260613122614"
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
  grep -q "function midjourneyContextLocalTaskId" "$file"
  grep -q "localTaskId=midjourneyContextLocalTaskId" "$file"
  grep -q "value=>value&&value!==localTaskId" "$file"
  grep -q "target.upstreamTaskId||target.providerTaskId" "$file"
  grep -q "await requestMidjourneyTaskManagement(ctx.node,'fetch'" "$file"
done

log "apply $PKG_NAME"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"

log "verify installed markers"
grep -q "function midjourneyContextLocalTaskId" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "localTaskId=midjourneyContextLocalTaskId" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "value=>value&&value!==localTaskId" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "target.upstreamTaskId||target.providerTaskId" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"
grep -q "await requestMidjourneyTaskManagement(ctx.node,'fetch'" "$PUBLIC_ROOT/workbench-web/image-studio-canvas-next.html"

log "done"
printf 'backup: %s\n' "$BACKUP_ROOT"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=20260613122614\n'
