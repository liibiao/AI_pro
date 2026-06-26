#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-response-format-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"

WORK="/tmp/gpt-image-response-format-fix-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
log "解压部署包：$WORK"
tar --warning=no-unknown-keyword -xzf "$PKG" -C "$WORK"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台 generation adapter"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"

API_DIR="$BACKEND_DIR/api-server"
log "编译后台"
cd "$API_DIR"
npm run build

log "校验 response_format 显式参数优先"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const text = fs.readFileSync('dist/modules/generation/adapters/registry.js', 'utf8');
const fnStart = text.indexOf('function openAiImageResponseFormat');
const fn = text.slice(fnStart, text.indexOf('function shouldPreferInlineImageResult', fnStart));
console.log(fn.trim());
if (!/const explicit/.test(fn) || fn.indexOf('const explicit') > fn.indexOf('shouldPreferInlineImageResult')) {
  throw new Error('openAiImageResponseFormat 未保持 explicit response_format 优先');
}
NODE

log "重启后台 PM2（使用 $PM2_USER 用户的 PM2 进程表）"
if [ "$(id -un)" = "$PM2_USER" ]; then
  pm2 restart ai-admin-api --update-env || pm2 restart all --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" bash -lc 'pm2 restart ai-admin-api --update-env || pm2 restart all --update-env; pm2 save || true'
else
  log "当前没有 sudo，已跳过 PM2 重启；请手动用 $PM2_USER 执行 pm2 restart ai-admin-api --update-env"
fi

log "部署完成：gpt-image-2-pro 会优先尊重前端 response_format=url，复用 43 中转站 COS 物化闭环"
