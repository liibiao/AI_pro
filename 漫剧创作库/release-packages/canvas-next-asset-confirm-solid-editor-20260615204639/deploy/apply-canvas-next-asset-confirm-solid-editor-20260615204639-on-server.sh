#!/usr/bin/env bash
set +H
set -euo pipefail
PKG="canvas-next-asset-confirm-solid-editor-20260615204639"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}}"
log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ "$@" && return 0; local rc=$?; if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then return "$rc"; fi; command -v sudo >/dev/null 2>&1 && sudo -n "$@" || return "$rc"; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT
backup_file(){ local dest="$1"; run_sudo test -f "$dest" || return 0; local backup="$BACKUP_DIR/${dest#/}"; run_sudo mkdir -p "$(dirname "$backup")"; run_sudo cp -p "$dest" "$backup"; }
install_file(){ local src="$1" dest="$2" label="$3"; [ -f "$src" ] || fail "$label missing: $src"; run_sudo mkdir -p "$(dirname "$dest")"; backup_file "$dest"; run_sudo cp -p "$src" "$dest"; log "installed $dest"; }
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"
grep -Fq "asset-confirm-editor-modal" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "openAssetConfirmCardEditorModal" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "background:#0b1118" "$SRC/workbench-web/image-studio-canvas-next.html"
run_sudo mkdir -p "$BACKUP_DIR"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas-next"
if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas-next"
fi
run_sudo grep -Fq "asset-confirm-editor-modal" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "openAssetConfirmCardEditorModal" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "background:#0b1118" "$WORKBENCH_DIR/image-studio-canvas-next.html"
log "done"
echo "backup: $BACKUP_DIR"
