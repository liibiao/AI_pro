#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
PKG="connection-side-anchor-fix-20260624210130"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
REPO_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_WEB="/var/www/ai-admin/workbench-web"
BACKUP_DIR="${REPO_ROOT}/.deploy-backups/${PKG}-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

fail(){
  echo "[deploy] ERROR: $*" >&2
  exit 1
}

must_contain(){
  local file="$1"
  local marker="$2"
  grep -Fq "$marker" "$file" || fail "missing marker in $file: $marker"
}

must_not_contain(){
  local file="$1"
  local marker="$2"
  if grep -Fq "$marker" "$file"; then
    fail "stale marker remains in $file: $marker"
  fi
}

check_canvas_next_html(){
  local file="$1"
  test -f "$file" || fail "missing canvas-next html: $file"
  must_contain "$file" "function rectDirectionalAnchor(r,dir)"
  must_contain "$file" "const d=S.connect.dir==='in'"
  must_contain "$file" "const dx=Math.min(Math.max(dist*.5,72),260);"
  must_not_contain "$file" "const sign=x2>=x1?1:-1;"
}

check_module_renderer(){
  local file="$1"
  test -f "$file" || fail "missing module renderer: $file"
  must_contain "$file" "const start=connectionAnchor(a,sr,'out');"
  must_contain "$file" "const end=connectionAnchor(b,sr,'in');"
  must_contain "$file" "function rectSideAnchor(r,dir)"
  must_contain "$file" "const dx=Math.max(96,Math.abs(x2-x1)*.42);"
  must_not_contain "$file" "const sign=x2>=x1?1:-1;"
}

check_legacy_canvas(){
  local file="$1"
  test -f "$file" || fail "missing legacy canvas: $file"
  must_contain "$file" "function rectDirectionalAnchor(r,dir)"
  must_contain "$file" "const d=S.connect.dir==='in'"
  must_contain "$file" "const dx=Math.min(Math.max(dist*.5,72),260);"
  must_not_contain "$file" "const sign=x2>=x1?1:-1;"
}

check_smart_v2(){
  local file="$1"
  test -f "$file" || fail "missing smart canvas v2: $file"
  must_contain "$file" "const dx = Math.max(80,Math.abs(p2.x - p1.x) * .45);"
  must_contain "$file" "const dx = Math.max(70,Math.abs(p2.x - p1.x) * .45);"
  must_not_contain "$file" "Math.max(80,(p2.x - p1.x) * .45)"
}

install_file(){
  local src="$1"
  local dst="$2"
  local label="$3"
  test -f "$src" || fail "source missing for $label: $src"
  mkdir -p "$(dirname "$dst")" "$(dirname "$BACKUP_DIR/${dst#/}")"
  if [ -f "$dst" ]; then
    cp -a "$dst" "$BACKUP_DIR/${dst#/}"
  fi
  install -m 0644 "$src" "$dst"
  echo "[deploy] installed $label -> $dst"
}

install_if_dir(){
  local dir="$1"
  local rel="$2"
  local src="$3"
  local label="$4"
  if [ -d "$dir" ]; then
    install_file "$src" "$dir/$rel" "$label"
  else
    echo "[deploy] skipped $label, directory not found: $dir"
  fi
}

echo "[deploy] extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC_NEXT="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_PUBLIC_RENDERER="$WORKDIR/workbench-web/canvas-next/renderers.js"
SRC_TOOLS_NEXT="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS_RENDERER="$WORKDIR/tools/workbench-web/canvas-next/renderers.js"
SRC_SMART_RENDERER="$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
SRC_SMART_LEGACY="$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
SRC_SMART_V2="$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/smart-vision-canvas-v2.html"

echo "[deploy] validate package markers"
check_canvas_next_html "$SRC_PUBLIC_NEXT"
check_canvas_next_html "$SRC_TOOLS_NEXT"
check_module_renderer "$SRC_PUBLIC_RENDERER"
check_module_renderer "$SRC_TOOLS_RENDERER"
check_module_renderer "$SRC_SMART_RENDERER"
check_legacy_canvas "$SRC_SMART_LEGACY"
check_smart_v2 "$SRC_SMART_V2"

echo "[deploy] backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

install_file "$SRC_PUBLIC_NEXT" "$PUBLIC_WEB/image-studio-canvas-next.html" "public canvas-next html"
install_file "$SRC_PUBLIC_RENDERER" "$PUBLIC_WEB/canvas-next/renderers.js" "public canvas-next renderer"

install_if_dir "$REPO_ROOT/tools/workbench-web" "image-studio-canvas-next.html" "$SRC_TOOLS_NEXT" "repo tools canvas-next html"
install_if_dir "$REPO_ROOT/tools/workbench-web" "canvas-next/renderers.js" "$SRC_TOOLS_RENDERER" "repo tools canvas-next renderer"

SMART_WEB="$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web"
install_if_dir "$SMART_WEB" "canvas-next/renderers.js" "$SRC_SMART_RENDERER" "smart legacy renderer"
install_if_dir "$SMART_WEB" "image-studio-canvas.html" "$SRC_SMART_LEGACY" "smart legacy canvas html"
install_if_dir "$SMART_WEB" "smart-vision-canvas-v2.html" "$SRC_SMART_V2" "smart canvas v2 html"

RUNTIME_WEB="$REPO_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
install_if_dir "$RUNTIME_WEB" "image-studio-canvas-next.html" "$SRC_TOOLS_NEXT" "runtime tools canvas-next html"
install_if_dir "$RUNTIME_WEB" "canvas-next/renderers.js" "$SRC_TOOLS_RENDERER" "runtime tools canvas-next renderer"

RUNTIME_SMART_WEB="$REPO_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/smart-vision/canvas/legacy-workbench/workbench-web"
install_if_dir "$RUNTIME_SMART_WEB" "canvas-next/renderers.js" "$SRC_SMART_RENDERER" "runtime smart legacy renderer"
install_if_dir "$RUNTIME_SMART_WEB" "image-studio-canvas.html" "$SRC_SMART_LEGACY" "runtime smart legacy canvas html"
install_if_dir "$RUNTIME_SMART_WEB" "smart-vision-canvas-v2.html" "$SRC_SMART_V2" "runtime smart canvas v2 html"

echo "[deploy] verify installed markers"
check_canvas_next_html "$PUBLIC_WEB/image-studio-canvas-next.html"
check_module_renderer "$PUBLIC_WEB/canvas-next/renderers.js"
if [ -f "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" ]; then
  check_canvas_next_html "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" ]; then
  check_module_renderer "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js"
fi
if [ -f "$SMART_WEB/image-studio-canvas.html" ]; then
  check_legacy_canvas "$SMART_WEB/image-studio-canvas.html"
fi
if [ -f "$SMART_WEB/smart-vision-canvas-v2.html" ]; then
  check_smart_v2 "$SMART_WEB/smart-vision-canvas-v2.html"
fi

echo "deployed $PKG"
echo "backup: $BACKUP_DIR"
