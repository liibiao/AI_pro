#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-next-selected-workflow-run-20260604032525"
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
MIRROR_SRC="$WORK_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  $SUDO cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

$SUDO install -m 0644 "$SRC" "$DEST"
log "installed $DEST"

if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    $SUDO cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  $SUDO install -m 0644 "${MIRROR_SRC:-$SRC}" "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

log "verify markers"
grep -Fq 'id="selRunBtn" title="整组执行"' "$DEST"
grep -Fq "function buildWorkflowExecutionPlan" "$DEST"
grep -Fq "function runSelectedWorkflow" "$DEST"
grep -Fq "async function runWorkflowNodes" "$DEST"
grep -Fq "workflowIncomingBlockers" "$DEST"
grep -Fq "选区存在循环依赖" "$DEST"
grep -Fq "上游依赖执行失败" "$DEST"
grep -Fq "on('selRunBtn',runSelectedWorkflow)" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
