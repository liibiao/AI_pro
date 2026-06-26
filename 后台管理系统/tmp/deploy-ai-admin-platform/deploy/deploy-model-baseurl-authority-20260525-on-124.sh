#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
BACKEND_DIR="${BACKEND_DIR:-${APP_DIR}/api-server}"
ADMIN_WEB_DIR="${ADMIN_WEB_DIR:-${APP_DIR}/admin-web}"
WORKDIR="/tmp/model-baseurl-authority-$(date +%Y%m%d%H%M%S)"

if [[ -z "${PKG}" || ! -f "${PKG}" ]]; then
  echo "用法: sudo APP_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/model-baseurl-authority-20260525.tar.gz" >&2
  exit 1
fi
if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "后台目录不存在: ${BACKEND_DIR}" >&2
  exit 1
fi
if [[ ! -d "${ADMIN_WEB_DIR}" ]]; then
  echo "后台前端目录不存在: ${ADMIN_WEB_DIR}" >&2
  exit 1
fi

echo "==> 解包"
mkdir -p "${WORKDIR}"
tar -xzf "${PKG}" -C "${WORKDIR}"

echo "==> 覆盖后台 sync-canvas-models 保护逻辑"
cp "${WORKDIR}/api-server/src/sync-canvas-models.ts" "${BACKEND_DIR}/src/sync-canvas-models.ts"
cp "${WORKDIR}/api-server/dist/sync-canvas-models.js" "${BACKEND_DIR}/dist/sync-canvas-models.js"

echo "==> 覆盖后台管理模型配置 UI"
cp "${WORKDIR}/admin-web/src/main.tsx" "${ADMIN_WEB_DIR}/src/main.tsx"

echo "==> 安装 baseURL 查询/迁移工具"
cp "${WORKDIR}/deploy/update-upstream-baseurl-20260525-on-124.sh" "/tmp/update-upstream-baseurl-20260525-on-124.sh"
chmod +x "/tmp/update-upstream-baseurl-20260525-on-124.sh"

echo "==> 编译后台"
cd "${BACKEND_DIR}"
npm run build

echo "==> 编译后台管理前端"
cd "${ADMIN_WEB_DIR}"
npm run build

echo "==> 可选：按环境变量执行 baseURL 更新"
if [[ "${RUN_BASEURL_UPDATE:-0}" == "1" ]]; then
  BACKEND_DIR="${BACKEND_DIR}" \
  CANVAS_MODELS_DIR="${CANVAS_MODELS_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web/models}" \
  OLD_BASE_URL="${OLD_BASE_URL:-http://43.165.186.217/v1}" \
  NEW_BASE_URL="${NEW_BASE_URL:-http://45.77.211.38:8317/v1}" \
  PROVIDER_KEY="${PROVIDER_KEY:-}" \
  bash "/tmp/update-upstream-baseurl-20260525-on-124.sh"
else
  echo "跳过数据库 baseURL 更新。需要时可单独运行 /tmp/update-upstream-baseurl-20260525-on-124.sh"
fi

echo "==> 重启后台 PM2（若存在）"
if command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && sudo -u ubuntu pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu pm2 restart ai-admin-api --update-env
  sudo -u ubuntu pm2 save || true
else
  echo "未找到 PM2 进程 ai-admin-api；如果服务由其他用户或方式托管，请手动重启后台。"
fi

echo "==> 校验关键标记"
grep -n "SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL" "${BACKEND_DIR}/dist/sync-canvas-models.js"
grep -n "新中转站 Vultr 45" "${ADMIN_WEB_DIR}/src/main.tsx"

echo "部署完成。"
