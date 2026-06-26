#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-refine-panorama-toolbar-fix-20260602195430"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SUDO=""
can_write_path(){
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != "/" ]; do
    path="$(dirname "$path")"
  done
  [ -w "$path" ]
}
if [ "$(id -u)" -ne 0 ] && { ! can_write_path "$WEB_ROOT" || ! can_write_path "$MIRROR_ROOT"; }; then
  SUDO="sudo"
fi

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  $SUDO cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

$SUDO cp -p "$SRC" "$DEST"
$SUDO chmod 0644 "$DEST"
log "installed $DEST"

if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    $SUDO cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  $SUDO cp -p "$SRC" "$MIRROR_DEST"
  $SUDO chmod 0644 "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

log "verify markers"
grep -Fq "imageToPanorama:{cat:'generate',name:'720全景图'" "$DEST"
grep -Fq "panoramaViewer:{cat:'output',name:'交互式 720° 全景查看',icon:'PANO',desc:'双击节点沉浸查看 720° 全景图，支持 720° 连续拖拽',w:380,hidden:true" "$DEST"
grep -Fq "function imageToPanoramaResultUrl(n)" "$DEST"
grep -Fq "const resultImg=imageToPanoramaResultUrl(n);" "$DEST"
grep -Fq "requestAnimationFrame(()=>focusNodeLarge(targetId));" "$DEST"
grep -Fq '已打开${singleImageProcessLabel(mode)}工具栏，选择模型和类型后点击执行' "$DEST"
grep -Fq "requestAnimationFrame(()=>focusNodeLarge(panoId));" "$DEST"
grep -Fq "toast('已打开全景图工具栏，选择模型和参数后点击执行','ok');" "$DEST"
grep -Fq "const nid=makeNode('imageToPanorama',pos.x,pos.y,{images:panoImages,displayRatio:'default'});" "$DEST"
if grep -Fq "await runNode(panoId" "$DEST"; then
  fail "unexpected panorama auto-run call remains"
fi
if grep -Fq "await confirmAiRefine(targetId)" "$DEST"; then
  fail "unexpected refine auto-run call remains"
fi
if grep -Fq "target='panoramaViewer'" "$DEST"; then
  fail "unexpected automatic panoramaViewer target remains"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
