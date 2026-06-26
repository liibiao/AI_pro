#!/usr/bin/env bash
set -euo pipefail

PKG="conn-fill-none-smooth-flow-fix-20260601142053"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "this deploy writes to $TARGET; please run it with sudo" >&2
  exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi
if [ ! -d "$TARGET/tools/workbench-web" ]; then
  echo "target workbench not found: $TARGET/tools/workbench-web" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
DEST="$TARGET/tools/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$SRC" ]; then
  echo "package file missing: $SRC" >&2
  exit 1
fi

log "backup current canvas"
mkdir -p "$BACKUP_DIR/tools/workbench-web"
cp -p "$DEST" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"

DEST_OWNER="$(stat -c '%u:%g' "$DEST")"
DEST_MODE="$(stat -c '%a' "$DEST")"

log "install connection fill/flow fix"
install -m "$DEST_MODE" "$SRC" "$DEST"
chown "$DEST_OWNER" "$DEST"

log "verify markers"
grep -Fq ".conn,.conn-hit{fill:none!important}" "$DEST"
grep -Fq ".conn-hit{stroke:transparent!important" "$DEST"
grep -Fq "hit.setAttribute('fill','none')" "$DEST"
grep -Fq "p.setAttribute('d',d);p.setAttribute('fill','none')" "$DEST"
grep -Fq "conn-flow-pill" "$DEST"
grep -Fq "connMinimalFlowGradient" "$DEST"
grep -Fq "['5%','.003']" "$DEST"
grep -Fq "['46%','.82']" "$DEST"
grep -Fq "['50%','1']" "$DEST"
grep -Fq "pill.setAttribute('width','48')" "$DEST"
grep -Fq "animateMotion" "$DEST"
if grep -Fq "['conn-flow-tail','conn-flow-glow','conn-flow-core']" "$DEST"; then
  echo "canvas-next still generates old wide glow flow classes" >&2
  exit 1
fi
if grep -Fq "['conn-flow-fade','conn-flow-mid','conn-flow-peak']" "$DEST"; then
  echo "canvas-next still generates old segmented flow classes" >&2
  exit 1
fi
if grep -Fq "startRect" "$DEST"; then
  echo "canvas-next still contains stale startRect reference" >&2
  exit 1
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
