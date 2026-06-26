#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <package.tar.gz>}"
APP_ROOT="${APP_ROOT:-/home/ubuntu/漫剧创作库}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
PUBLIC_TOOLS_ROOT="${PUBLIC_TOOLS_ROOT:-/var/www/ai-admin/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$APP_ROOT/.deploy-backups/canvas-ref-stack-delay-hold-20260625004016-$STAMP"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK_DIR"

backup_file() {
  local target="$1"
  if [ -f "$target" ]; then
    local rel="${target#/}"
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -a "$target" "$BACKUP_DIR/$rel"
  fi
}

install_file() {
  local src="$1"
  local dst="$2"
  [ -f "$src" ] || return 0
  backup_file "$dst"
  mkdir -p "$(dirname "$dst")"
  install -m 0644 "$src" "$dst"
}

require_marker() {
  local marker="$1"
  local file="$2"
  if ! grep -q "$marker" "$file"; then
    echo "Missing marker '$marker' in $file" >&2
    exit 1
  fi
}

HTML_SRC="$WORK_DIR/payload/tools/workbench-web/image-studio-canvas-next.html"
PUBLIC_HTML_SRC="$WORK_DIR/payload/workbench-web/image-studio-canvas-next.html"

require_marker "REF_STACK_COLLAPSE_DELAY_MS=1500" "$HTML_SRC"
require_marker "function bindDelayedReferenceStackCollapse" "$HTML_SRC"
require_marker "display:flex!important" "$HTML_SRC"
require_marker "visibility:visible!important" "$HTML_SRC"
require_marker "ref-open>.vn2-ref-expanded" "$HTML_SRC"
require_marker "ref-open>.vn2-ref-collapsed" "$HTML_SRC"
require_marker "area.classList.add('ref-open')" "$HTML_SRC"
require_marker "querySelectorAll('.vn2-ref-expanded')" "$HTML_SRC"
require_marker "panel.addEventListener('pointerenter',open)" "$HTML_SRC"
require_marker "bindDelayedReferenceStackCollapse(el)" "$HTML_SRC"
require_marker "bindDelayedReferenceStackCollapse(group)" "$HTML_SRC"

install_file "$HTML_SRC" "$APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$PUBLIC_HTML_SRC" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install_file "$HTML_SRC" "$PUBLIC_TOOLS_ROOT/image-studio-canvas-next.html"

echo "Installed canvas reference-stack delayed hold update."
echo "Backup: $BACKUP_DIR"
