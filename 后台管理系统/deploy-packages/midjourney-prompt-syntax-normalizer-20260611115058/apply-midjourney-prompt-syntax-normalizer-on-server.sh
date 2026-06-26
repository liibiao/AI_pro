#!/usr/bin/env bash
set -euo pipefail

PKG_NAME="midjourney-prompt-syntax-normalizer-20260611115058"
ARCHIVE="${1:-/tmp/${PKG_NAME}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG_NAME}-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG_NAME}-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ ! -f "$ARCHIVE" ]]; then
  echo "找不到部署包：$ARCHIVE" >&2
  exit 1
fi
if [[ ! -d "$APP_ROOT/api-server" ]]; then
  echo "找不到 api-server：$APP_ROOT/api-server" >&2
  exit 1
fi

tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
mkdir -p "$BACKUP_DIR"

install_file() {
  local source="$1"
  local target="$2"
  local backup_name
  if [[ ! -f "$source" ]]; then
    echo "部署包缺少文件：$source" >&2
    exit 1
  fi
  backup_name="$(printf '%s' "$target" | sed 's#[/: ]#_#g')"
  if [[ -f "$target" ]]; then
    cp -a "$target" "$BACKUP_DIR/$backup_name.bak"
  fi
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
}

CANVAS_SOURCE="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
install_file "$CANVAS_SOURCE" "$WEB_ROOT/image-studio-canvas-next.html"
install_file "$CANVAS_SOURCE" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$CANVAS_SOURCE" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
if [[ -d "$MIRROR_ROOT" ]]; then
  install_file "$CANVAS_SOURCE" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

install_file "$WORKDIR/api-server/src/modules/generation/midjourney-prompt.ts" \
  "$APP_ROOT/api-server/src/modules/generation/midjourney-prompt.ts"
install_file "$WORKDIR/api-server/dist/modules/generation/midjourney-prompt.js" \
  "$APP_ROOT/api-server/dist/modules/generation/midjourney-prompt.js"
install_file "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" \
  "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
install_file "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" \
  "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

grep -Fq "normalizeMidjourneyPromptSyntax" "$WEB_ROOT/image-studio-canvas-next.html"
grep -Fq "检测到 MJ 提示词格式问题，已自动修复后提交" "$WEB_ROOT/image-studio-canvas-next.html"
grep -Fq "normalizeMidjourneyPromptSyntax" "$APP_ROOT/api-server/dist/modules/generation/midjourney-prompt.js"
grep -Fq "midjourney-prompt.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  pm2 save >/dev/null 2>&1 || true
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart "$PM2_APP" --update-env
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save >/dev/null 2>&1 || true
else
  echo "没有找到 $PM2_APP PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null
curl -fsS http://127.0.0.1/image-studio-canvas-next.html | grep -Fq "normalizeMidjourneyPromptSyntax"

echo "部署完成，备份目录：$BACKUP_DIR"
