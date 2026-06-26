#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
PKG="gpt2pro-canvas-node-fixed-options-20260620042530"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-$MIRROR_ROOT/tools/workbench-web}"
LEGACY_ROOT="${LEGACY_ROOT:-$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web}"
RUNTIME_WORKBENCH_ROOT="${RUNTIME_WORKBENCH_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web}"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}}"

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

verify_markers(){
  local file="$1"
  grep -Fq "const GPT_IMAGE2_PRO_RESOLUTIONS=['1k','2k'];" "$file"
  grep -Fq "const GPT_IMAGE2_PRO_SIZE_RATIOS=['auto','1:1','3:2','2:3'];" "$file"
  grep -Fq "const flexible=!gptImage2Pro&&isOpenAiFlexibleImageAdapter(adapter);" "$file"
  grep -Fq "isGptImage2ProModel(imageModel||{})||!isOpenAiFlexibleImageAdapter(adapter)" "$file"
  grep -Fq "function normalizeShotVideoPromptStoryboardRatio" "$file"
  grep -Fq "imageSizeOptionsForSelection(selectedModel,adapter,composite.resolution)" "$file"
  grep -Fq "const ratioOptions=imageSizeOptionsForSelection(model,adapter,resolution)" "$file"
}

tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || SRC="$WORKDIR"

for rel in \
  "workbench-web/image-studio-canvas-next.html" \
  "tools/workbench-web/image-studio-canvas-next.html"; do
  [ -f "$SRC/$rel" ] || fail "required file missing from archive: $rel"
  verify_markers "$SRC/$rel"
done

mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$PUBLIC_ROOT" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$TOOLS_ROOT" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$LEGACY_ROOT" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$LEGACY_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$RUNTIME_WORKBENCH_ROOT" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi

[ "$installed" -gt 0 ] || fail "no install target found"

for file in \
  "$PUBLIC_ROOT/image-studio-canvas-next.html" \
  "$TOOLS_ROOT/image-studio-canvas-next.html" \
  "$LEGACY_ROOT/image-studio-canvas-next.html" \
  "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html"; do
  if [ -f "$file" ]; then
    verify_markers "$file"
  fi
done

log "deployed $PKG"
echo "backup: $BACKUP_DIR"
