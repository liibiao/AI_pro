#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-trackpad-wheel-pan-over-node-fix-20260604160452"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"

log "verify package markers"
grep -Fq "isWheelHardBlockedTarget" "$HTML_SRC"
grep -Fq "shouldCanvasHandleWheel" "$HTML_SRC"
grep -Fq "{passive:false,capture:true}" "$HTML_SRC"
grep -Fq "wheelScrollableTarget" "$HTML_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/workbench-web" "$BACKUP_DIR/mirror/workbench-web" "$(dirname "$HTML_DEST")"
run_sudo cp -a "$HTML_DEST" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_HTML_DEST" "$BACKUP_DIR/mirror/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas html"
run_sudo install -m 0644 "$HTML_SRC" "$HTML_DEST"
if run_sudo test -d "$(dirname "$MIRROR_HTML_DEST")"; then
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_HTML_DEST"
fi

log "verify installed markers"
run_sudo grep -Fq "isWheelHardBlockedTarget" "$HTML_DEST"
run_sudo grep -Fq "shouldCanvasHandleWheel" "$HTML_DEST"
run_sudo grep -Fq "{passive:false,capture:true}" "$HTML_DEST"
run_sudo grep -Fq "wheelScrollableTarget" "$HTML_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
