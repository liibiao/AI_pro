#!/usr/bin/env bash
set +H
set -euo pipefail
PKG="text-prompt-typewriter-plain-20260622102141"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"
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
TOOLS_HTML_SRC="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_SRC" ] || fail "package missing workbench html"
[ -f "$TOOLS_HTML_SRC" ] || fail "package missing tools html"
log "verify package markers"
grep -Fq '.prompt-i2i-output.streaming' "$HTML_SRC"
grep -Fq 'streamingResult' "$HTML_SRC"
! grep -Fq 'prompt-chat' "$HTML_SRC"
! grep -Fq 'prompt-typewriter-cursor' "$HTML_SRC"
log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/workbench-web" "$BACKUP_DIR/tools/workbench-web" "$WORKBENCH_ROOT" "$REMOTE_ROOT/tools/workbench-web"
run_sudo cp -a "$REMOTE_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-image-studio-canvas-next.html" 2>/dev/null || true
log "install canvas html"
run_sudo install -m 0644 "$HTML_SRC" "$REMOTE_ROOT/image-studio-canvas-next.html"
run_sudo install -m 0644 "$HTML_SRC" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
run_sudo install -m 0644 "$TOOLS_HTML_SRC" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  run_sudo install -m 0644 "$TOOLS_HTML_SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
log "verify installed markers"
run_sudo grep -Fq '.prompt-i2i-output.streaming' "$REMOTE_ROOT/image-studio-canvas-next.html"
! run_sudo grep -Fq 'prompt-chat' "$REMOTE_ROOT/image-studio-canvas-next.html"
! run_sudo grep -Fq 'prompt-typewriter-cursor' "$REMOTE_ROOT/image-studio-canvas-next.html"
log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
