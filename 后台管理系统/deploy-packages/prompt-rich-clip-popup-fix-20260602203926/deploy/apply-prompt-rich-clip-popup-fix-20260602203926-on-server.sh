#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="prompt-rich-clip-popup-fix-20260602203926"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
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
grep -Fq ".prompt-at-popup{position:fixed!important" "$DEST"
grep -Fq "function renderPromptRichInput(n,placeholder='')" "$DEST"
grep -Fq "function promptRichNodePlainText(node)" "$DEST"
grep -Fq "function insertPromptRichReference(input,payload,range=null)" "$DEST"
grep -Fq "if(popup.parentElement!==document.body)document.body.appendChild(popup);" "$DEST"
grep -Fq "if(isPromptRichInput(input))insertPromptRichReference(input,payload,getI2iSelectionRange(input));" "$DEST"
grep -Fq "renderPromptRichInput(n,'支持上传图片、视频、文件，或直接粘贴 URL')" "$DEST"
grep -Fq "renderPromptRichInput(n,'支持上传多张图片参考，可用于替换角色、道具、场景参考')" "$DEST"
grep -Fq "renderPromptRichInput(n,'请填写剧本、提示词、动作描述、画面需求...')" "$DEST"
grep -Fq "function insertPromptReferenceAtDropTarget(target,payload,x,y)" "$DEST"
grep -Fq "function startPromptReferencePointerDrag(src,payload,downEvent)" "$DEST"
grep -Fq "src.draggable=false" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
