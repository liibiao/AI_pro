#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="sora-video-pro-9img-dedupe-20260607140908"
ARCHIVE="${1:-}"
APP_ROOT="${APP_ROOT:-/var/www/ai-admin/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
PM2_USER="${PM2_USER:-ubuntu}"
BACKUP_ROOT="$MIRROR_TARGET/.deploy-backups/${RELEASE_ID}-$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d "/tmp/${RELEASE_ID}.XXXXXX")"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  fail "archive not found: $ARCHIVE"
fi

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

install_file() {
  local rel="$1"
  local dest="$2"
  local src="$TMP_DIR/$rel"
  [[ -f "$src" ]] || fail "package missing $rel"
  mkdir -p "$BACKUP_ROOT/$(dirname "${dest#/}")" "$(dirname "$dest")"
  if [[ -f "$dest" ]]; then
    cp -p "$dest" "$BACKUP_ROOT/${dest#/}"
  fi
  install -m 0644 "$src" "$dest"
  log "installed $dest"
}

verify_no_duplicate_sora_first_image() {
  local file="$1"
  [[ -f "$file" ]] || fail "verify file missing: $file"
  if grep -Eq "image_url:imageRefs\\[0\\]\\|\\|''|imageUrl:imageRefs\\[0\\]\\|\\|''|payload\\.image_url=images\\[0\\]\\|\\|''|payload\\.imageUrl=images\\[0\\]\\|\\|''" "$file"; then
    fail "duplicate sora-video-pro image_url marker still exists: $file"
  fi
}

grep -Fq "resolveSoraVideoProExplicitImageUrl" "$TMP_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -Fq "resolveSoraVideoProExplicitImageUrl" "$TMP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "_sora_video_pro_explicit_image_url" "$TMP_DIR/tools/image_studio_backend.py"
grep -Fq "_sora_video_pro_explicit_image_url" "$TMP_DIR/smart-vision/services/workbench/image_studio_backend.py"
verify_no_duplicate_sora_first_image "$TMP_DIR/workbench-web/image-studio-canvas-next.html"
verify_no_duplicate_sora_first_image "$TMP_DIR/workbench-web/image-studio-canvas.html"
verify_no_duplicate_sora_first_image "$TMP_DIR/workbench-web/canvas-next/generation-service.js"
verify_no_duplicate_sora_first_image "$TMP_DIR/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_no_duplicate_sora_first_image "$TMP_DIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "backup: $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT"

install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

if [[ -d "$WORKBENCH_DIR" ]]; then
  install_file "workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  install_file "workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html"
  install_file "workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js"
else
  log "public workbench skipped: $WORKBENCH_DIR"
fi

if [[ -d "$MIRROR_TARGET/tools/workbench-web" ]]; then
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
  install_file "tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html"
  install_file "tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js"
  install_file "tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py"
else
  log "mirror workbench skipped: $MIRROR_TARGET/tools/workbench-web"
fi

if [[ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]]; then
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
  install_file "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
fi

if [[ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]]; then
  install_file "smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"
fi

cd "$APP_ROOT"
node --check api-server/dist/modules/generation/adapters/registry.js
if command -v python3 >/dev/null 2>&1; then
  python3 -m py_compile "$MIRROR_TARGET/tools/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" >/dev/null 2>&1 || true
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 show ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 restart ai-admin-api --update-env || true
  fi
fi

curl -fsS --max-time 8 http://127.0.0.1:4000/api/health >/dev/null || curl -fsS --max-time 8 http://127.0.0.1/api/health >/dev/null || true

log "done: $RELEASE_ID"
echo "backup: $BACKUP_ROOT"
