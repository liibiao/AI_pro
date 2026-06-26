#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <package.tar.gz>}"
APP_ROOT="${APP_ROOT:-/home/ubuntu/漫剧创作库}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
PUBLIC_TOOLS_ROOT="${PUBLIC_TOOLS_ROOT:-/var/www/ai-admin/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$APP_ROOT/.deploy-backups/canvas-gpt2-channel-selection-result-fix-20260624212215-$STAMP"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK_DIR"

backup_file() {
  local target="$1"
  if [ -f "$target" ]; then
    local rel="${target#/}"
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -a "$target" "$BACKUP_DIR/$rel"
  fi
}

install_file() {
  local src="$1"
  local dst="$2"
  [ -f "$src" ] || return 0
  backup_file "$dst"
  mkdir -p "$(dirname "$dst")"
  install -m 0644 "$src" "$dst"
}

HTML_SRC="$WORK_DIR/payload/tools/workbench-web/image-studio-canvas-next.html"
ADAPTER_SRC="$WORK_DIR/payload/tools/workbench-web/canvas-next/generator-adapters.js"
BACKEND_SRC="$WORK_DIR/payload/smart-vision/services/workbench/image_studio_backend.py"
LEGACY_ADAPTER_SRC="$WORK_DIR/payload/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js"

grep -q "schedulePreviewSyncPersist" "$HTML_SRC"
grep -q "MODEL_CONFIG_STATE" "$HTML_SRC"
grep -q "后台渠道配置" "$HTML_SRC"
if grep -qi "newapi" "$HTML_SRC"; then
  echo "Refusing to install: NewAPI frontend logic is still present." >&2
  exit 1
fi
grep -q "IMAGE_RESULT_URL_KEYS" "$BACKEND_SRC"
grep -q "_normalize_aiyunzhi_firefly_response" "$BACKEND_SRC"
grep -q "_selectionKey" "$ADAPTER_SRC"

install_file "$HTML_SRC" "$APP_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$ADAPTER_SRC" "$APP_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
install_file "$BACKEND_SRC" "$APP_ROOT/smart-vision/services/workbench/image_studio_backend.py"
install_file "$LEGACY_ADAPTER_SRC" "$APP_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js"

install_file "$WORK_DIR/payload/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install_file "$WORK_DIR/payload/workbench-web/canvas-next/generator-adapters.js" "$PUBLIC_ROOT/canvas-next/generator-adapters.js"
install_file "$HTML_SRC" "$PUBLIC_TOOLS_ROOT/image-studio-canvas-next.html"
install_file "$ADAPTER_SRC" "$PUBLIC_TOOLS_ROOT/canvas-next/generator-adapters.js"

python3 -m py_compile "$APP_ROOT/smart-vision/services/workbench/image_studio_backend.py" || true

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  fi
fi

echo "Installed canvas GPT2 channel selection/result fix with NewAPI frontend logic removed."
echo "Backup: $BACKUP_DIR"
