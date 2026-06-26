#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-result-cos-cap-fix-20260522.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"

WORK="/tmp/gpt-image-result-cos-cap-fix-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
log "解压部署包：$WORK"
tar --warning=no-unknown-keyword -xzf "$PKG" -C "$WORK"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台 GPT-Image 结果转存修复"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"

API_DIR="$BACKEND_DIR/api-server"
log "编译后台"
cd "$API_DIR"
npm run build

log "校验生成结果 COS 大小限制已独立"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const config = fs.readFileSync('dist/config.js', 'utf8');
const storage = fs.readFileSync('dist/object-storage.js', 'utf8');
const registry = fs.readFileSync('dist/modules/generation/adapters/registry.js', 'utf8');
if (!config.includes('GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES')) throw new Error('缺少生成结果专用大小限制配置');
if (!storage.includes('maxBytes')) throw new Error('对象存储上传缺少 maxBytes 覆盖能力');
if (!registry.includes('generationResultObjectStorageMaxBytes')) throw new Error('generation adapter 未使用生成结果专用大小限制');
if (!registry.includes('IMAGE_RESULT_MATERIALIZE_FAILED')) throw new Error('结果转存失败保护分支缺失');
console.log('generation result COS cap: ok');
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

log "部署完成：124 后台已把 GPT-Image 生成结果 COS 转存大小限制独立为默认 80MB"
