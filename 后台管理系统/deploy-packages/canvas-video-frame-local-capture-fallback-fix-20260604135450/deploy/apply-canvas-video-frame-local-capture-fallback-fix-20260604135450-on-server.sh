#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-video-frame-local-capture-fallback-fix-20260604135450"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"

HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
MIRROR_TOOLS_SERVER="$MIRROR_ROOT/tools/workbench_server.py"
MIRROR_SERVICE_SERVER="$MIRROR_ROOT/smart-vision/services/workbench/workbench_server.py"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$WORK_DIR"

HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
TOOLS_SERVER_SRC="$SRC_ROOT/tools/workbench_server.py"
SERVICE_SERVER_SRC="$SRC_ROOT/smart-vision/services/workbench/workbench_server.py"

[ -f "$HTML_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"
[ -f "$TOOLS_SERVER_SRC" ] || fail "package missing tools/workbench_server.py"
[ -f "$SERVICE_SERVER_SRC" ] || fail "package missing smart-vision/services/workbench/workbench_server.py"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
mkdir -p "$BACKUP_DIR" "$(dirname "$HTML_DEST")"

backup_one(){
  local src="$1"
  local name="$2"
  if [ -f "$src" ]; then
    cp -p "$src" "$BACKUP_DIR/$name" || true
  fi
}

install_one(){
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp -p "$src" "$dest"
  chmod 0644 "$dest"
  log "installed $dest"
}

log "backup current files"
backup_one "$HTML_DEST" "image-studio-canvas-next.html.web.bak"
backup_one "$MIRROR_HTML_DEST" "image-studio-canvas-next.html.mirror.bak"
backup_one "$MIRROR_TOOLS_SERVER" "workbench_server.py.tools.bak"
backup_one "$MIRROR_SERVICE_SERVER" "workbench_server.py.services.bak"

log "install canvas html"
install_one "$HTML_SRC" "$HTML_DEST"

if [ -d "$(dirname "$MIRROR_HTML_DEST")" ]; then
  install_one "$HTML_SRC" "$MIRROR_HTML_DEST"
fi

if [ -d "$(dirname "$MIRROR_TOOLS_SERVER")" ]; then
  install_one "$TOOLS_SERVER_SRC" "$MIRROR_TOOLS_SERVER"
fi

if [ -d "$(dirname "$MIRROR_SERVICE_SERVER")" ]; then
  install_one "$SERVICE_SERVER_SRC" "$MIRROR_SERVICE_SERVER"
fi

log "verify markers"
grep -Fq "captureVideoFrameForNode" "$HTML_DEST"
grep -Fq "video/frame-file'+query" "$HTML_DEST"
grep -Fq "local ffmpeg capture failed" "$HTML_DEST"

if [ -f "$MIRROR_TOOLS_SERVER" ]; then
  grep -Fq "capture_uploaded_video_frame" "$MIRROR_TOOLS_SERVER"
  grep -Fq "/api/workbench/image-studio/video/frame-file" "$MIRROR_TOOLS_SERVER"
fi

if [ -f "$MIRROR_SERVICE_SERVER" ]; then
  grep -Fq "capture_uploaded_video_frame" "$MIRROR_SERVICE_SERVER"
  grep -Fq "/api/workbench/image-studio/video/frame-file" "$MIRROR_SERVICE_SERVER"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
