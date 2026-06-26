#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="text-prompt-mode-output-bind-20260602021531"
ARCHIVE="${1:-}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$ARCHIVE" ] || fail "missing archive path"
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${TS}"
mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi
cp -p "$SRC" "$DEST"
log "installed $DEST"

MIRROR_DEST="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  cp -p "$SRC" "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

grep -Fq "function textPromptOutputKindForMode" "$DEST"
grep -Fq "rewrite:'prompt'" "$DEST"
grep -Fq "'url-extract':'default'" "$DEST"
grep -Fq "'file-parse':'default'" "$DEST"
grep -Fq "script:'script'" "$DEST"
grep -Fq "expand:'expand'" "$DEST"
grep -Fq '输出物：${outputLabel}' "$DEST"
grep -Fq "outputType:outputKindToWorkbench(n.values.outputKind||'prompt')" "$DEST"
grep -Fq "if(n.type==='textPrompt'&&inp.dataset.field==='mode')syncTextPromptOutputKind" "$DEST"
grep -Fq "if(n.type==='textPrompt'&&field==='mode')syncTextPromptOutputKind" "$DEST"

if grep -Fq "prompt-output-kind" "$DEST"; then
  fail "text prompt output format capsule CSS/DOM marker still exists"
fi
if grep -Fq 'data-field="outputKind"' "$DEST"; then
  fail "text prompt outputKind select still exists"
fi
if grep -Fq "renderTextPromptOutputKindControl" "$DEST"; then
  fail "text prompt output format render function still exists"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
