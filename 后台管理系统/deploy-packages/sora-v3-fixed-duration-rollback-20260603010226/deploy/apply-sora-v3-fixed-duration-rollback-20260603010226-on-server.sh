#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v3-fixed-duration-rollback-20260603010226"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  DEST_PARENT="$WEB_ROOT/workbench-web"
  if { [ -d "$DEST_PARENT" ] && [ -w "$DEST_PARENT" ]; } && [ -d "$MIRROR_ROOT" ] && [ -w "$MIRROR_ROOT" ]; then
    SUDO=""
  else
    SUDO="sudo"
  fi
fi

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
PKG_ROOT="$WORK_DIR/$PKG"
[ -d "$PKG_ROOT" ] || PKG_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  if [ -f "$PKG_ROOT/$rel" ]; then
    printf '%s\n' "$PKG_ROOT/$rel"
  elif [ -f "$PKG_ROOT/tools/$rel" ]; then
    printf '%s\n' "$PKG_ROOT/tools/$rel"
  else
    fail "$rel not found in package"
  fi
}

install_one(){
  local rel="$1"
  local src
  src="$(src_for "$rel")"
  local dest="$WEB_ROOT/$rel"
  local mirror_dest="$MIRROR_ROOT/tools/$rel"
  $SUDO mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    $SUDO cp -p "$dest" "$BACKUP_DIR/$(basename "$rel").web.bak"
  fi
  $SUDO cp -p "$src" "$dest"
  $SUDO chmod 0644 "$dest"
  log "installed $dest"
  if [ -d "$(dirname "$mirror_dest")" ]; then
    if [ -f "$mirror_dest" ]; then
      $SUDO cp -p "$mirror_dest" "$BACKUP_DIR/$(basename "$rel").mirror.bak"
    fi
    $SUDO cp -p "$src" "$mirror_dest"
    $SUDO chmod 0644 "$mirror_dest"
    log "updated mirror $mirror_dest"
  fi
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR"

install_one "workbench-web/image-studio-canvas-next.html"
install_one "workbench-web/models/sora-v3-pro.json"
install_one "workbench-web/models/sora-3.0-pro-2.json"

HTML="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
SORA_PRO="$WEB_ROOT/workbench-web/models/sora-v3-pro.json"
SORA_PRO2="$WEB_ROOT/workbench-web/models/sora-3.0-pro-2.json"

log "verify markers"
grep -Fq "const SORA_V3_FIXED_DURATIONS=[5,10,15];" "$HTML"
grep -Fq "key.includes('sora-v3-pro')||key.includes('sora-v3-fast')" "$HTML"
grep -Fq "durations:SORA_V3_FIXED_DURATIONS" "$HTML"
grep -Fq '"durations": [5, 10, 15]' "$SORA_PRO"
grep -Fq '"durations": [5, 10, 15]' "$SORA_PRO2"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
