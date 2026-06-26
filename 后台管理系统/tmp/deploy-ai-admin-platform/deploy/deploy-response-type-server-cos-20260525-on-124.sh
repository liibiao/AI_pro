#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
BACKEND_DIR="${BACKEND_DIR:-${APP_DIR}/api-server}"
ADMIN_WEB_DIR="${ADMIN_WEB_DIR:-${APP_DIR}/admin-web}"
WORKDIR="/tmp/response-type-server-cos-$(date +%Y%m%d%H%M%S)"

if [[ -z "${PKG}" || ! -f "${PKG}" ]]; then
  echo "用法: sudo APP_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/response-type-server-cos-20260525.tar.gz" >&2
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

echo "==> 覆盖后台 response_type=server_object_storage 逻辑"
cp "${WORKDIR}/api-server/src/modules/generation/adapters/registry.ts" "${BACKEND_DIR}/src/modules/generation/adapters/registry.ts"
cp "${WORKDIR}/api-server/src/modules/generation/routes.ts" "${BACKEND_DIR}/src/modules/generation/routes.ts"
cp "${WORKDIR}/api-server/src/modules/models/routes.ts" "${BACKEND_DIR}/src/modules/models/routes.ts"
cp "${WORKDIR}/api-server/dist/modules/generation/adapters/registry.js" "${BACKEND_DIR}/dist/modules/generation/adapters/registry.js"
cp "${WORKDIR}/api-server/dist/modules/generation/routes.js" "${BACKEND_DIR}/dist/modules/generation/routes.js"
cp "${WORKDIR}/api-server/dist/modules/models/routes.js" "${BACKEND_DIR}/dist/modules/models/routes.js"

echo "==> 覆盖后台管理模型配置 UI"
cp "${WORKDIR}/admin-web/src/main.tsx" "${ADMIN_WEB_DIR}/src/main.tsx"

echo "==> 编译后台"
cd "${BACKEND_DIR}"
npm run build

echo "==> 编译后台管理前端"
cd "${ADMIN_WEB_DIR}"
npm run build

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
grep -n "server_object_storage" "${BACKEND_DIR}/dist/modules/generation/adapters/registry.js"
grep -n "server_object_storage" "${BACKEND_DIR}/dist/modules/generation/routes.js"
grep -n "server_object_storage" "${BACKEND_DIR}/dist/modules/models/routes.js"
grep -n "124 后台转存 COS" "${ADMIN_WEB_DIR}/src/main.tsx"

echo "部署完成。"
