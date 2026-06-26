#!/usr/bin/env bash
set -euo pipefail

PKG="grok-image-size-ratio-fix-20260606001749"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/www/ai-admin/backups}"
STAMP="$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"

log(){ printf '[%s] %s\n' "$PKG" "$*"; }
fail(){ printf '[%s] ERROR: %s\n' "$PKG" "$*" >&2; exit 1; }

cleanup(){
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC="$TMP_DIR/$PKG"
[ -d "$SRC/workbench-web/canvas-next" ] || fail "package missing workbench-web/canvas-next"

grep -q "imageRequestGeometry" "$SRC/workbench-web/canvas-next/generation-service.js" || fail "generation-service marker missing"
grep -q "syncImageModeSize" "$SRC/workbench-web/canvas-next/app.js" || fail "app marker missing"
grep -q "imageRatioFieldValue" "$SRC/workbench-web/image-studio-canvas-next.html" || fail "canvas html marker missing"
grep -q "aspectRatios" "$SRC/workbench-web/models/grok-image.json" || fail "grok image model marker missing"

FILES=(
  "image-studio-canvas-next.html"
  "canvas-next/app.js"
  "canvas-next/generation-service.js"
  "canvas-next/renderers.js"
  "canvas-next/node-defs.js"
  "canvas-next/generator-adapters.js"
  "models/grok-image.json"
  "models/grok-image-edit.json"
)

backup_file(){
  local dest="$1"
  local label="$2"
  [ -f "$dest" ] || return 0
  local backup_dir="$BACKUP_ROOT/${PKG}-${STAMP}/$label/$(dirname "$dest" | sed 's#^/##')"
  mkdir -p "$backup_dir"
  cp -p "$dest" "$backup_dir/"
}

install_into(){
  local src_root="$1"
  local dest_root="$2"
  local label="$3"
  [ -d "$dest_root" ] || return 1
  log "install $label: $dest_root"
  for rel in "${FILES[@]}"; do
    [ -f "$src_root/$rel" ] || fail "missing package file: $src_root/$rel"
    mkdir -p "$dest_root/$(dirname "$rel")"
    backup_file "$dest_root/$rel" "$label"
    cp -p "$src_root/$rel" "$dest_root/$rel"
  done
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest_root" | cut -c1-8)" = "/var/www" ]; then
    chown -R www-data:www-data "$dest_root/canvas-next" "$dest_root/models" "$dest_root/image-studio-canvas-next.html" 2>/dev/null || true
  fi
  chmod 644 "$dest_root/image-studio-canvas-next.html" "$dest_root"/canvas-next/*.js "$dest_root"/models/grok-image*.json 2>/dev/null || true
  grep -q "imageRequestGeometry" "$dest_root/canvas-next/generation-service.js" || fail "$label install verification failed"
  return 0
}

installed=0
if install_into "$SRC/workbench-web" "$WORKBENCH_DIR" "public"; then
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

MIRROR_DIR="$MIRROR_TARGET/tools/workbench-web"
if install_into "$SRC/tools/workbench-web" "$MIRROR_DIR" "mirror"; then
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_DIR"
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "done"
log "backup root: $BACKUP_ROOT/${PKG}-${STAMP}"
