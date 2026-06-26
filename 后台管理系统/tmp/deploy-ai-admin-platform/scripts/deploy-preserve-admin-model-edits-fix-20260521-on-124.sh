#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/preserve-admin-model-edits-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"

WORK="/tmp/preserve-admin-model-edits-fix-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
log "解压部署包：$WORK"
tar --warning=no-unknown-keyword -xzf "$PKG" -C "$WORK"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台同步脚本和安全版部署脚本"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"
if [ -d "$WORK/scripts" ]; then
  mkdir -p "$BACKEND_DIR/scripts"
  rsync -a "$WORK/scripts/" "$BACKEND_DIR/scripts/"
fi
rm -f /tmp/deploy-seedance-vip-routing-model-fix-20260521-on-124.sh

API_DIR="$BACKEND_DIR/api-server"
log "编译后台"
cd "$API_DIR"
npm run build

log "校验 sync-canvas-models 默认不覆盖后台手动修改"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const text = fs.readFileSync('dist/sync-canvas-models.js', 'utf8');
if (!text.includes('SYNC_CANVAS_MODELS_OVERWRITE')) throw new Error('缺少 SYNC_CANVAS_MODELS_OVERWRITE 开关');
if (!text.includes('overwriteExisting')) throw new Error('缺少 overwriteExisting 保护');
console.log('sync preserve manual edits: ok');
NODE

log "查看 Seedance 当前数据库配置（只读，不写库）"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const row = await prisma.aiModel.findUnique({
  where: { id: 'canvas-seedance2-vip' },
  include: { provider: true },
});
console.log(JSON.stringify({
  id: row?.id,
  name: row?.name,
  displayName: row?.displayName,
  adapter: row?.adapter,
  providerKey: row?.provider?.providerKey,
  providerAdapter: row?.provider?.adapter,
  defaultModel: row?.provider?.defaultModel,
  baseUrl: row?.provider?.baseUrl,
  uploadMode: row?.uploadMode,
  providerUploadMode: row?.provider?.uploadMode,
}, null, 2));
await prisma.$disconnect();
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

log "部署完成：后续 sync-canvas-models 默认不会覆盖后台模型管理中的手动修改；需要强制覆盖时显式设置 SYNC_CANVAS_MODELS_OVERWRITE=true"
