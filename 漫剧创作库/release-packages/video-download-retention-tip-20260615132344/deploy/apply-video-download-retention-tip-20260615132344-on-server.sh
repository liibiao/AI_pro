#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
PKG="video-download-retention-tip-20260615132344"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-$MIRROR_ROOT/tools/workbench-web}"
LEGACY_ROOT="${LEGACY_ROOT:-$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web}"
RUNTIME_WORKBENCH_ROOT="${RUNTIME_WORKBENCH_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web}"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}}"
MARKER="上游生成视频后保存视频大概3-6个小时就会删除, 一定要及时下载, 或者打开自动下载功能"

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

backup_file(){
  local dest="$1"
  [ -f "$dest" ] || return 0
  local rel="${dest#/}"
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp -p "$dest" "$BACKUP_DIR/$rel"
}

install_file(){
  local src="$1" dest="$2"
  [ -f "$src" ] || fail "missing package file: $src"
  mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  install -m 0644 "$src" "$dest"
  log "installed $dest"
}

verify_marker(){
  local file="$1"
  grep -Fq "$MARKER" "$file"
}

tar -xzf "$ARCHIVE" -C "$WORKDIR"

required_files=(
  "workbench-web/image-studio-canvas-next.html"
  "workbench-web/image-studio-canvas.html"
  "workbench-web/canvas-next/renderers.js"
  "tools/workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/image-studio-canvas.html"
  "tools/workbench-web/canvas-next/renderers.js"
  "smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
  "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
)
for rel in "${required_files[@]}"; do
  test -f "$WORKDIR/$rel" || fail "required file missing from archive: $rel"
  verify_marker "$WORKDIR/$rel" || fail "marker missing from package file: $rel"
done

mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$PUBLIC_ROOT" ]; then
  install_file "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
  install_file "$WORKDIR/workbench-web/image-studio-canvas.html" "$PUBLIC_ROOT/image-studio-canvas.html"
  install_file "$WORKDIR/workbench-web/canvas-next/renderers.js" "$PUBLIC_ROOT/canvas-next/renderers.js"
  installed=$((installed+1))
fi

if [ -d "$TOOLS_ROOT" ]; then
  install_file "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
  install_file "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$TOOLS_ROOT/image-studio-canvas.html"
  install_file "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$TOOLS_ROOT/canvas-next/renderers.js"
  installed=$((installed+1))
fi

if [ -d "$LEGACY_ROOT" ]; then
  install_file "$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$LEGACY_ROOT/image-studio-canvas.html"
  install_file "$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "$LEGACY_ROOT/canvas-next/renderers.js"
  installed=$((installed+1))
fi

if [ -d "$RUNTIME_WORKBENCH_ROOT" ]; then
  install_file "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html"
  install_file "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas.html"
  install_file "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$RUNTIME_WORKBENCH_ROOT/canvas-next/renderers.js"
  installed=$((installed+1))
fi

[ "$installed" -gt 0 ] || fail "no install target found"

for file in \
  "$PUBLIC_ROOT/image-studio-canvas-next.html" \
  "$PUBLIC_ROOT/image-studio-canvas.html" \
  "$PUBLIC_ROOT/canvas-next/renderers.js" \
  "$TOOLS_ROOT/image-studio-canvas-next.html" \
  "$TOOLS_ROOT/image-studio-canvas.html" \
  "$TOOLS_ROOT/canvas-next/renderers.js" \
  "$LEGACY_ROOT/image-studio-canvas.html" \
  "$LEGACY_ROOT/canvas-next/renderers.js" \
  "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html" \
  "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas.html" \
  "$RUNTIME_WORKBENCH_ROOT/canvas-next/renderers.js"; do
  if [ -f "$file" ]; then
    verify_marker "$file" || fail "marker missing after deploy: $file"
  fi
done

log "deployed $PKG"
echo "backup: $BACKUP_DIR"
