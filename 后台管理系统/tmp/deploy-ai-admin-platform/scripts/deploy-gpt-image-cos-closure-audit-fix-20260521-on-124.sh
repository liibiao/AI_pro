#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-cos-closure-audit-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"

WORK="/tmp/gpt-image-cos-closure-audit-fix-$(date +%Y%m%d%H%M%S)"
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

log "校验 GPT-Image-2 COS 闭环策略"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const text = fs.readFileSync('dist/modules/generation/adapters/registry.js', 'utf8');
const start = text.indexOf('function openAiImageResponseFormat');
const end = text.indexOf('function shouldUseProviderUrlImageResult', start);
const fn = text.slice(start, end);
console.log(fn.trim());
if (!/const explicit/.test(fn)) throw new Error('缺少 explicit response_format 处理');
if (fn.indexOf('const explicit') > fn.indexOf('shouldUseProviderUrlImageResult')) throw new Error('显式 response_format 没有优先');
if (fn.indexOf('shouldUseProviderUrlImageResult') > fn.indexOf('shouldPreferInlineImageResult')) throw new Error('gpt-image-2 URL 闭环兜底没有优先于 b64_json');
if (!text.includes('function shouldUseProviderUrlImageResult')) throw new Error('缺少 gpt-image-2 URL 闭环识别函数');
if (!text.includes('canvas_gpt-image-2-pro') || !text.includes('canvas-gpt-image-2-pro')) throw new Error('缺少 canvas gpt-image-2-pro 识别标记');
if (!text.includes('responseFormat')) throw new Error('缺少 responseFormat 驼峰字段兼容处理');
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

log "部署完成：GPT-Image-2-pro 全部 openai-edits 生图路径默认复用 43 base64 -> COS URL 闭环"
