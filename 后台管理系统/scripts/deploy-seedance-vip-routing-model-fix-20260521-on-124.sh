#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/seedance-vip-routing-model-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/api-server" ] || fail "找不到后台 api-server：$BACKEND_DIR/api-server"
[ -d "$CANVAS_DIR/tools/workbench-web" ] || fail "找不到画布目录：$CANVAS_DIR/tools/workbench-web"

WORK="/tmp/seedance-vip-routing-model-fix-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
log "解压部署包：$WORK"
tar --warning=no-unknown-keyword -xzf "$PKG" -C "$WORK"

log "清理 macOS 扩展属性影子文件"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台修复文件"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"

log "覆盖画布 seedance2.0-vip 模型配置"
rsync -a "$WORK/canvas/" "$CANVAS_DIR/"
mkdir -p "$ONLINE_WORKBENCH_DIR/models"
cp "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json" "$ONLINE_WORKBENCH_DIR/models/seedance2-vip.json"

API_DIR="$BACKEND_DIR/api-server"
log "编译后台"
cd "$API_DIR"
npm run build

log "同步画布模型到后台数据库"
CANVAS_MODELS_DIR="$CANVAS_DIR/tools/workbench-web/models" node dist/sync-canvas-models.js | grep -i -E 'seedance|Canvas model sync' || true

log "查看 canvas_seedance2-vip 当前数据库配置（不覆盖后台手动修改）"
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
  endpointPath: row?.endpointPath,
  statusEndpointPath: row?.statusEndpointPath,
  expectedModel720p: `${row?.name || 'sora-vip3-pro'}-720p`,
  expectedModel1080p: `${row?.name || 'sora-vip3-pro'}-1080p`,
}, null, 2));
await prisma.$disconnect();
NODE

log "应用最新积分定价，避免 sora 通用规则覆盖 seedance VIP"
node dist/apply-pricing.js

log "校验编译产物"
grep -n "seedance2-vip" "$API_DIR/dist/modules/generation/routes.js" | head -5
grep -n "resolveSeedance2VipModelName" "$API_DIR/dist/modules/generation/adapters/registry.js" | head -5
grep -n "soraVideoModelWhere" "$API_DIR/dist/apply-pricing.js" | head -5
grep -n '"model": "sora-vip3-pro"' "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"
grep -n '"adapter": "seedance2-vip"' "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"

log "重启后台 PM2（使用 $PM2_USER 用户的 PM2 进程表）"
if [ "$(id -un)" = "$PM2_USER" ]; then
  pm2 restart ai-admin-api --update-env || pm2 restart all --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" bash -lc 'pm2 restart ai-admin-api --update-env || pm2 restart all --update-env; pm2 save || true'
else
  log "当前没有 sudo，已跳过 PM2 重启；请手动用 $PM2_USER 执行 pm2 restart ai-admin-api --update-env"
fi

log "部署完成：seedance2.0-vip 会走 seedance2-vip 适配器，并按后台模型管理中的 model 拼接分辨率后发送到 43"
