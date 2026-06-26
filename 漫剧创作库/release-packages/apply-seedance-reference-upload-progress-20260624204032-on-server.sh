#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /tmp/seedance-reference-upload-progress-20260624204032.tar.gz" >&2
  exit 2
fi

PKG_NAME="seedance-reference-upload-progress-20260624204032"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"
ROOT_DIR="${ROOT_DIR:-/var/www/ai-admin}"
PUBLIC_DIR="${PUBLIC_DIR:-/var/www/ai-admin/workbench-web}"
PUBLIC_TOOLS_DIR="${PUBLIC_TOOLS_DIR:-/var/www/ai-admin/tools/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

verify_canvas(){
  local file="$1"
  grep -Fq "function renderUploadProgressMask(img,label='处理中',idx=null)" "$file"
  grep -Fq "data-upload-key" "$file"
  grep -Fq "const makeVn2ReferenceImageEntry=file=>({" "$file"
  grep -Fq "const uploadMaskTargets=" "$file"
  grep -Fq "const createUploadProgressMask=" "$file"
  if grep -Fq "const entry={dataUrl:'',name:f.name,size:f.size,type:f.type,status:'loading'" "$file"; then
    fail "old seedance reference upload entry without fileKey still exists: $file"
  fi
}

backup_file(){
  local dest="$1"
  [ -f "$dest" ] || return 0
  local rel="${dest#/}"
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp -p "$dest" "$BACKUP_DIR/$rel"
}

install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  install -m 0644 "$src" "$dest"
  log "installed $dest"
}

install_if_exists(){
  local src="$1" dest="$2" label="$3"
  [ -f "$dest" ] || return 0
  install_file "$src" "$dest" "$label"
}

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"

PUBLIC_NEXT_SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
PUBLIC_LEGACY_SRC="$WORK_DIR/workbench-web/image-studio-canvas.html"
TOOLS_NEXT_SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas-next.html"
TOOLS_LEGACY_SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas.html"

log "verify package markers"
verify_canvas "$PUBLIC_NEXT_SRC"
verify_canvas "$PUBLIC_LEGACY_SRC"
verify_canvas "$TOOLS_NEXT_SRC"
verify_canvas "$TOOLS_LEGACY_SRC"
grep -Fq ".node.node-type-seedanceVideo :is(.vn2-fl-card,.vn2-mf-slot,.vn2-ref-chip,.ref-stack-layer)>.thumb-mask" "$PUBLIC_NEXT_SRC"
grep -Fq ".node.node-type-seedanceVideo :is(.vn2-fl-card,.vn2-mf-slot,.vn2-ref-chip,.ref-stack-layer)>.thumb-mask" "$TOOLS_NEXT_SRC"

log "backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

log "install public workbench: $PUBLIC_DIR"
install_file "$PUBLIC_NEXT_SRC" "$PUBLIC_DIR/image-studio-canvas-next.html" "public canvas next"
install_file "$PUBLIC_LEGACY_SRC" "$PUBLIC_DIR/image-studio-canvas.html" "public legacy canvas"

log "install public tools workbench: $PUBLIC_TOOLS_DIR"
install_file "$TOOLS_NEXT_SRC" "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" "public tools canvas next"
install_file "$TOOLS_LEGACY_SRC" "$PUBLIC_TOOLS_DIR/image-studio-canvas.html" "public tools legacy canvas"

log "install mirror workbench: $MIRROR_DIR"
install_file "$TOOLS_NEXT_SRC" "$MIRROR_DIR/image-studio-canvas-next.html" "mirror canvas next"
install_file "$TOOLS_LEGACY_SRC" "$MIRROR_DIR/image-studio-canvas.html" "mirror legacy canvas"

install_if_exists "$PUBLIC_NEXT_SRC" "$ROOT_DIR/image-studio-canvas-next.html" "root canvas next"
install_if_exists "$PUBLIC_LEGACY_SRC" "$ROOT_DIR/image-studio-canvas.html" "root legacy canvas"

log "verify installed markers"
verify_canvas "$PUBLIC_DIR/image-studio-canvas-next.html"
verify_canvas "$PUBLIC_DIR/image-studio-canvas.html"
verify_canvas "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html"
verify_canvas "$PUBLIC_TOOLS_DIR/image-studio-canvas.html"
verify_canvas "$MIRROR_DIR/image-studio-canvas-next.html"
verify_canvas "$MIRROR_DIR/image-studio-canvas.html"

log "done"
echo "deployed ${PKG_NAME}"
echo "backup: $BACKUP_DIR"
