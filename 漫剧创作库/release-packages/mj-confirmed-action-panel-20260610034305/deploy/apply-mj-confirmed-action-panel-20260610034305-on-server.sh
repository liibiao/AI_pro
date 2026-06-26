#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="mj-confirmed-action-panel-20260610034305"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

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
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}
verify_html(){
  local file="$1"
  grep -Fq "const MIDJOURNEY_CONFIRMED_ACTION_GROUPS=[" "$file"
  grep -Fq "function renderMidjourneyDetailActions(page)" "$file"
  grep -Fq '<div class="mj-detail-k">功能操作</div>' "$file"
  grep -Fq '<div class="mj-pager" role="group" aria-label="切换 MJ 结果">' "$file"
  grep -Fq "width:14.4px!important" "$file"
  grep -Fq "细腻放大" "$file"
  grep -Fq "创意放大" "$file"
  grep -Fq "局部重绘" "$file"
  grep -Fq "自定义扩展" "$file"
  grep -Fq "高动态动画" "$file"
  grep -Fq "低动态动画" "$file"
  grep -Fq "强烈变体" "$file"
  grep -Fq "重新生成" "$file"
  grep -Fq "panleft" "$file"
  grep -Fq "pandown" "$file"
}
verify_html_sudo(){
  local file="$1"
  run_sudo grep -Fq "const MIDJOURNEY_CONFIRMED_ACTION_GROUPS=[" "$file"
  run_sudo grep -Fq "function renderMidjourneyDetailActions(page)" "$file"
  run_sudo grep -Fq '<div class="mj-detail-k">功能操作</div>' "$file"
  run_sudo grep -Fq '<div class="mj-pager" role="group" aria-label="切换 MJ 结果">' "$file"
  run_sudo grep -Fq "width:14.4px!important" "$file"
  run_sudo grep -Fq "细腻放大" "$file"
  run_sudo grep -Fq "重新生成" "$file"
  run_sudo grep -Fq "panleft" "$file"
  run_sudo grep -Fq "pandown" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
  verify_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
  installed=$((installed+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  verify_html_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
  installed=$((installed+1))
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas"
  verify_html_sudo "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

[ "$installed" -gt 0 ] || fail "no public or mirror workbench target found"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
