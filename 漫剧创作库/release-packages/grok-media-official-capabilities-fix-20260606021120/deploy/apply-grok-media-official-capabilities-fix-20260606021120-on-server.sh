#!/usr/bin/env bash
set -euo pipefail

PKG="grok-media-official-capabilities-fix-20260606021120"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/www/ai-admin/backups}"
STAMP="$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"

log(){ printf '[%s] %s\n' "$PKG" "$*"; }
fail(){ printf '[%s] ERROR: %s\n' "$PKG" "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC="$TMP_DIR/$PKG"
[ -d "$SRC/workbench-web/canvas-next" ] || fail "package missing workbench-web/canvas-next"
[ -d "$SRC/tools/workbench-web/canvas-next" ] || fail "package missing tools/workbench-web/canvas-next"

grep -q "GROK_VIDEO_DURATIONS" "$SRC/workbench-web/image-studio-canvas-next.html" || fail "canvas html video duration marker missing"
grep -q "GROK_IMAGE_PIXEL_HINTS" "$SRC/workbench-web/image-studio-canvas-next.html" || fail "canvas html image hint marker missing"
grep -q "normalizeVideoRequestValues" "$SRC/workbench-web/canvas-next/generation-service.js" || fail "generation-service video marker missing"
grep -q "GROK_VIDEO_ASPECT_RATIOS" "$SRC/workbench-web/canvas-next/renderers.js" || fail "renderers video marker missing"
grep -q "19.5:9" "$SRC/workbench-web/canvas-next/app.js" || fail "app ratio marker missing"
grep -q '"maxVideoDurationSeconds": 15' "$SRC/workbench-web/models/grok-video.json" || fail "grok video model marker missing"

FILES=(
  "image-studio-canvas-next.html"
  "canvas-next/app.js"
  "canvas-next/generation-service.js"
  "canvas-next/renderers.js"
  "models/grok-image.json"
  "models/grok-image-edit.json"
  "models/grok-video.json"
)

backup_file(){
  local dest="$1"
  local label="$2"
  [ -f "$dest" ] || return 0
  local backup_dir="$BACKUP_ROOT/${PKG}-${STAMP}/$label/$(dirname "$dest" | sed 's#^/##')"
  run_sudo mkdir -p "$backup_dir"
  run_sudo cp -p "$dest" "$backup_dir/"
}

install_into(){
  local src_root="$1"
  local dest_root="$2"
  local label="$3"
  run_sudo test -d "$dest_root" || return 1
  log "install $label: $dest_root"
  for rel in "${FILES[@]}"; do
    [ -f "$src_root/$rel" ] || fail "missing package file: $src_root/$rel"
    run_sudo mkdir -p "$dest_root/$(dirname "$rel")"
    backup_file "$dest_root/$rel" "$label"
    run_sudo cp -p "$src_root/$rel" "$dest_root/$rel"
  done
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest_root" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown -R www-data:www-data "$dest_root/canvas-next" "$dest_root/models" "$dest_root/image-studio-canvas-next.html" 2>/dev/null || true
  fi
  run_sudo chmod 644 "$dest_root/image-studio-canvas-next.html" "$dest_root"/canvas-next/*.js "$dest_root"/models/grok-*.json 2>/dev/null || true
  run_sudo grep -q "normalizeVideoRequestValues" "$dest_root/canvas-next/generation-service.js" || fail "$label install verification failed"
  run_sudo grep -q '"maxVideoDurationSeconds": 15' "$dest_root/models/grok-video.json" || fail "$label video model verification failed"
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
