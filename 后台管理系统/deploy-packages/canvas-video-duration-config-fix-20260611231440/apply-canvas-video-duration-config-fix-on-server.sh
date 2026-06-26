#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
CANVAS_REPO_ROOT="${CANVAS_REPO_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/canvas-video-duration-config-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-video-duration-config-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"

REQ=(
  "tools/workbench-web/image-studio-canvas.html"
  "tools/workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/canvas-next/renderers.js"
  "tools/workbench-web/canvas-next/generation-service.js"
  "smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
  "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
)
for path in "${REQ[@]}"; do
  test -s "$WORKDIR/$path" || { echo "missing package file: $path" >&2; exit 1; }
done

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web/canvas-next" \
  "$BACKUP_DIR/canvas-repo/tools/workbench-web/canvas-next"

cp -a "$WORKBENCH_ROOT/image-studio-canvas.html" "$BACKUP_DIR/workbench-web/image-studio-canvas.html" 2>/dev/null || true
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/image-studio-canvas.html" "$BACKUP_DIR/image-studio-canvas.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/canvas-next/renderers.js" "$BACKUP_DIR/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/canvas-next/generation-service.js" "$BACKUP_DIR/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
cp -a "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas.html" "$BACKUP_DIR/canvas-repo/tools/workbench-web/image-studio-canvas.html" 2>/dev/null || true
cp -a "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/canvas-repo/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" "$BACKUP_DIR/canvas-repo/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
cp -a "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next/generation-service.js" "$BACKUP_DIR/canvas-repo/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "[deploy] install canvas files"
mkdir -p \
  "$WORKBENCH_ROOT" \
  "$REMOTE_ROOT/tools/workbench-web/canvas-next" \
  "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next"

install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$WORKBENCH_ROOT/image-studio-canvas.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$REMOTE_ROOT/image-studio-canvas.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$REMOTE_ROOT/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/generation-service.js" "$REMOTE_ROOT/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/generation-service.js" "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "[deploy] verify markers"
grep -F "raw.videoDurations" "$WORKBENCH_ROOT/image-studio-canvas.html" >/dev/null
grep -F "raw.videoDurations" "$WORKBENCH_ROOT/image-studio-canvas-next.html" >/dev/null
grep -F "allowedDurations" "$REMOTE_ROOT/tools/workbench-web/canvas-next/renderers.js" >/dev/null
grep -F "allowedDurations" "$REMOTE_ROOT/tools/workbench-web/canvas-next/generation-service.js" >/dev/null
grep -F "raw.videoDurations" "$CANVAS_REPO_ROOT/tools/workbench-web/image-studio-canvas.html" >/dev/null
grep -F "allowedDurations" "$CANVAS_REPO_ROOT/tools/workbench-web/canvas-next/generation-service.js" >/dev/null
curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
