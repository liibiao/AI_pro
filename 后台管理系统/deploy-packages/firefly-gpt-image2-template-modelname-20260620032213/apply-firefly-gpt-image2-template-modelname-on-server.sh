#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: $0 /tmp/firefly-gpt-image2-template-modelname-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/firefly-gpt-image2-template-modelname-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/firefly-gpt-image2-template-modelname-$STAMP"

SRC_REGISTRY="$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
DIST_REGISTRY="$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
REPAIR_SCRIPT="$DEPLOY_DIR/ai-admin-platform/api-server/scripts/repair-firefly-gpt-image2-template-modelname.mjs"

mkdir -p "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/scripts"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

verify_registry() {
  local file="$1"
  grep -q "AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH" "$file"
  grep -q "resolveAiyunzhiFireflyEndpointPath" "$file"
  grep -q "aiyunzhiFireflyModelNameMode" "$file"
  grep -q "resolveEndpointPath(resolveAiyunzhiFireflyEndpointPath(ctx), ctx)" "$file"
}

if [[ ! -f "$SRC_REGISTRY" || ! -f "$DIST_REGISTRY" || ! -f "$REPAIR_SCRIPT" ]]; then
  echo "部署包缺少 registry 或 repair 脚本" >&2
  exit 1
fi
verify_registry "$SRC_REGISTRY"
verify_registry "$DIST_REGISTRY"
grep -q "canvas-aiyunzhi-gpt-image-2" "$REPAIR_SCRIPT"
grep -q "modelNameMode" "$REPAIR_SCRIPT"

echo "==> 备份 Firefly 后台适配器到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/scripts/repair-firefly-gpt-image2-template-modelname.mjs" \
  "$BACKUP_DIR/ai-admin-platform/api-server/scripts/repair-firefly-gpt-image2-template-modelname.mjs" 2>/dev/null || true

echo "==> 覆盖后台 Firefly adapter runtime guard"
mkdir -p "$REMOTE_API_ROOT/api-server/scripts"
cp -a "$SRC_REGISTRY" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DIST_REGISTRY" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$REPAIR_SCRIPT" "$REMOTE_API_ROOT/api-server/scripts/repair-firefly-gpt-image2-template-modelname.mjs"

echo "==> 校验远端文件"
verify_registry "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
node --check "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 修复 Firefly 模型配置"
(cd "$REMOTE_API_ROOT/api-server" && node scripts/repair-firefly-gpt-image2-template-modelname.mjs)

echo "==> 校验 Firefly DB 配置"
(cd "$REMOTE_API_ROOT/api-server" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const endpoint = '/v1/chat/completions';
const targets = [
  ['canvas-aiyunzhi-firefly-gpt-image', 'template'],
  ['canvas-aiyunzhi-gpt-image-2', 'template'],
];
for (const [id, mode] of targets) {
  const model = await prisma.aiModel.findUnique({ where: { id }, include: { provider: true } });
  if (!model) throw new Error(`missing model ${id}`);
  const protocol = model.protocol || {};
  if (model.adapter !== 'aiyunzhi-firefly-gpt-image') throw new Error(`${id} adapter=${model.adapter}`);
  if (model.endpointPath !== endpoint) throw new Error(`${id} endpoint=${model.endpointPath}`);
  if (model.provider?.endpointPath !== endpoint) throw new Error(`${id} providerEndpoint=${model.provider?.endpointPath}`);
  if ((protocol.endpointPath || protocol.endpoint_path) !== endpoint) throw new Error(`${id} protocol endpoint=${protocol.endpointPath || protocol.endpoint_path}`);
  if ((protocol.modelNameMode || protocol.model_name_mode || model.modelAssembly?.type) !== mode) throw new Error(`${id} mode=${protocol.modelNameMode || protocol.model_name_mode || model.modelAssembly?.type}`);
  if (model.supports?.img2img !== true || model.supports?.imageToImage !== true) throw new Error(`${id} img2img support missing`);
  console.log(`[verify] ${id} adapter=${model.adapter} endpoint=${model.endpointPath} mode=${mode} status=${model.status}`);
}
await prisma.$disconnect();
NODE
)

echo "==> 重启后端"
if command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
elif command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q '"pm_id"'; then
  pm2 restart all --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 jlist 2>/dev/null | grep -q '"pm_id"'; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart all --update-env
else
  echo "没有找到可重启的 PM2 后端进程" >&2
  exit 1
fi

echo "==> 校验服务"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
echo "部署完成。备份目录: $BACKUP_DIR"
