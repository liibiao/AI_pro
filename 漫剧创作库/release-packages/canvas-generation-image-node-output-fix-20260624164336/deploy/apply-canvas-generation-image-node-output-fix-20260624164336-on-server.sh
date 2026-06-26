#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-generation-image-node-output-fix-20260624164336-${STAMP}"

PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

verify_html(){
  local file="$1"
  test -f "$file"
  grep -Fq "function payloadForPreviewTarget" "$file"
  grep -Fq "function imageOutputDisplayUrl" "$file"
  grep -Fq "function imageEntriesFromPayload" "$file"
  grep -Fq "setSingleImageFromUpstreamResult" "$file"
  grep -Fq "ensureGeneratedEntryLocalPreview(entry" "$file"
}

verify_app(){
  local file="$1"
  test -f "$file"
  grep -Fq "function imageOutputUrl" "$file"
  grep -Fq "function imageOutputImages" "$file"
  grep -Fq "b64_json" "$file"
}

verify_state(){
  local file="$1"
  test -f "$file"
  grep -Fq "saved.assetPreviewUrl" "$file"
}

verify_generation_service(){
  local file="$1"
  test -f "$file"
  grep -Fq "b64_json" "$file"
  grep -Fq "assetPreviewUrls" "$file"
}

verify_tree(){
  local root="$1"
  verify_html "$root/image-studio-canvas-next.html"
  verify_app "$root/canvas-next/app.js"
  verify_state "$root/canvas-next/state.js"
  verify_generation_service "$root/canvas-next/generation-service.js"
}

verify_tree "$WORKDIR/workbench-web"
verify_tree "$WORKDIR/tools/workbench-web"

mkdir -p \
  "$BACKUP_DIR/public/canvas-next" \
  "$BACKUP_DIR/tools/canvas-next" \
  "$PUBLIC_ROOT/canvas-next" \
  "$TOOLS_ROOT/canvas-next"

backup_if_exists(){
  local src="$1"
  local dst="$2"
  if [ -f "$src" ]; then
    cp -a "$src" "$dst"
  fi
}

backup_if_exists "$PUBLIC_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/public/image-studio-canvas-next.html"
backup_if_exists "$PUBLIC_ROOT/canvas-next/app.js" "$BACKUP_DIR/public/canvas-next/app.js"
backup_if_exists "$PUBLIC_ROOT/canvas-next/state.js" "$BACKUP_DIR/public/canvas-next/state.js"
backup_if_exists "$PUBLIC_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/public/canvas-next/generation-service.js"
backup_if_exists "$TOOLS_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/tools/image-studio-canvas-next.html"
backup_if_exists "$TOOLS_ROOT/canvas-next/app.js" "$BACKUP_DIR/tools/canvas-next/app.js"
backup_if_exists "$TOOLS_ROOT/canvas-next/state.js" "$BACKUP_DIR/tools/canvas-next/state.js"
backup_if_exists "$TOOLS_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/tools/canvas-next/generation-service.js"

install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/app.js" "$PUBLIC_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/state.js" "$PUBLIC_ROOT/canvas-next/state.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/generation-service.js" "$PUBLIC_ROOT/canvas-next/generation-service.js"

install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/app.js" "$TOOLS_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/state.js" "$TOOLS_ROOT/canvas-next/state.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/generation-service.js" "$TOOLS_ROOT/canvas-next/generation-service.js"

verify_tree "$PUBLIC_ROOT"
verify_tree "$TOOLS_ROOT"

echo "deployed canvas-generation-image-node-output-fix-20260624164336"
echo "backup: $BACKUP_DIR"
echo "canvas: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
