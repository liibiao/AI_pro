#!/usr/bin/env bash
set +H
set -euo pipefail
PKG="sora-3-pro-2-video-channel-202606021504"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT
log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
ROOT="$WORK_DIR/$PKG"
[ -d "$ROOT" ] || ROOT="$WORK_DIR"
TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${TS}"
mkdir -p "$BACKUP_DIR"
install_file(){ local src="$1" dest="$2" label="$3"; [ -f "$src" ] || fail "$label not found in package: $src"; mkdir -p "$(dirname "$dest")"; if [ -f "$dest" ]; then cp -p "$dest" "$BACKUP_DIR/$(basename "$dest").${label}.bak"; fi; cp -p "$src" "$dest"; log "installed $dest"; }
install_file "$ROOT/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "web_canvas"
install_file "$ROOT/workbench-web/models/sora-3.0-pro-2.json" "$WEB_ROOT/workbench-web/models/sora-3.0-pro-2.json" "web_model"
if [ -d "$MIRROR_TARGET" ]; then
  install_file "$ROOT/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror_canvas"
  install_file "$ROOT/workbench-web/models/sora-3.0-pro-2.json" "$MIRROR_TARGET/tools/workbench-web/models/sora-3.0-pro-2.json" "mirror_model"
  install_file "$ROOT/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "mirror_backend"
fi
grep -Fq '"modelNick": "sora-3.0-pro-2"' "$WEB_ROOT/workbench-web/models/sora-3.0-pro-2.json"
grep -Fq 'sora-3.0-pro-2' "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy. If backend service is long-running, restart it after deployment."
