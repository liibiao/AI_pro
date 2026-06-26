#!/usr/bin/env bash
set -euo pipefail

PKG="asset-card-mj-smart-confirm-ui-20260614145052"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
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
verify_markers(){
  local file="$1"
  grep -Fq "assetCardRatioOptionsHtml" "$file"
  grep -Fq "assetCardMidjourneyVersionOptionsHtml" "$file"
  grep -Fq "data-asset-card-field=\"mjVersion\"" "$file"
  grep -Fq "data-asset-card-composite-mj-version" "$file"
  grep -Fq "midjourneySmartNodeValuesForType" "$file"
  grep -Fq "_appliedTemplateId:templateId" "$file"
}
verify_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "assetCardRatioOptionsHtml" "$file"
  run_sudo grep -Fq "assetCardMidjourneyVersionOptionsHtml" "$file"
  run_sudo grep -Fq "data-asset-card-field=\"mjVersion\"" "$file"
  run_sudo grep -Fq "data-asset-card-composite-mj-version" "$file"
  run_sudo grep -Fq "midjourneySmartNodeValuesForType" "$file"
  run_sudo grep -Fq "_appliedTemplateId:templateId" "$file"
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

verify_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

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
[ "$INSTALLED" -gt 0 ] || fail "no install target found"

if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "done"
printf 'backup: %s\n' "$BACKUP_DIR"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=%s\n' "$STAMP"
