#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?missing archive path}"
ROOT="${CANVAS_ROOT:-/home/ubuntu/漫剧创作库}"
WORK_DIR="$(mktemp -d /tmp/canvas-multigrid-ref-popup-upscale-fix.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

tar -xzf "$ARCHIVE" -C "$WORK_DIR"
PKG_DIR="$WORK_DIR/canvas-multigrid-ref-popup-upscale-fix-20260626122135"

install -m 0644 "$PKG_DIR/tools/workbench-web/image-studio-canvas-next.html" "$ROOT/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$ROOT/workbench-web" ]; then
  install -m 0644 "$PKG_DIR/workbench-web/image-studio-canvas-next.html" "$ROOT/workbench-web/image-studio-canvas-next.html"
fi

echo "canvas multigrid ref popup upscale fix applied"
