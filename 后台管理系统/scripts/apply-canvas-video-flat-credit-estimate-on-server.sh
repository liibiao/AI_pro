#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-video-flat-credit-estimate-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 canvas-video-flat-credit-estimate-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/canvas-video-flat-credit-estimate-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-video-flat-credit-estimate-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
mkdir -p "$BACKUP_DIR/workbench-web"
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"
cp -a "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_ROOT/image-studio-canvas-next.html"

grep -q "videoFlatPricing" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "chargedCreditsPerGeneration" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "视频按次统一价" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

echo "部署完成，备份目录：$BACKUP_DIR"
