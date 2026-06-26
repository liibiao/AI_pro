#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
CANVAS_MODELS_DIR="${CANVAS_MODELS_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web/models}"
OLD_BASE_URL="${OLD_BASE_URL:-http://43.165.186.217/v1}"
NEW_BASE_URL="${NEW_BASE_URL:-http://45.77.211.38:8317/v1}"
PROVIDER_KEY="${PROVIDER_KEY:-}"
DRY_RUN="${DRY_RUN:-0}"

echo "==> 后台目录: ${BACKEND_DIR}"
echo "==> 画布模型目录: ${CANVAS_MODELS_DIR}"
echo "==> OLD: ${OLD_BASE_URL}"
echo "==> NEW: ${NEW_BASE_URL}"
if [[ -n "${PROVIDER_KEY}" ]]; then
  echo "==> 仅更新 providerKey=${PROVIDER_KEY}"
else
  echo "==> 更新所有 baseUrl 等于 OLD 的 provider"
fi

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "后台目录不存在: ${BACKEND_DIR}" >&2
  exit 1
fi

cd "${BACKEND_DIR}"

echo "==> 1/4 检查新中转站 HTTP 连通性"
NEW_ORIGIN="$(node -e 'const u=new URL(process.argv[1]); console.log(`${u.protocol}//${u.host}`)' "${NEW_BASE_URL}")"
if command -v curl >/dev/null 2>&1; then
  curl -fsS --connect-timeout 5 --max-time 10 "${NEW_ORIGIN}/" >/dev/null \
    && echo "新中转站连通: ${NEW_ORIGIN}/" \
    || echo "警告：新中转站根路径暂时无法访问，请确认 45 服务器防火墙/端口/服务状态"
fi

echo "==> 2/4 查询并更新数据库 upstreamProvider.baseUrl"
export OLD_BASE_URL NEW_BASE_URL PROVIDER_KEY DRY_RUN
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const oldBaseUrl = String(process.env.OLD_BASE_URL || '').replace(/\/+$/, '');
const newBaseUrl = String(process.env.NEW_BASE_URL || '').replace(/\/+$/, '');
const providerKey = String(process.env.PROVIDER_KEY || '').trim();
const dryRun = process.env.DRY_RUN === '1';

function modelSummary(provider) {
  return (provider.models || [])
    .map(model => `${model.id}/${model.name}/${model.type}/${model.status}`)
    .join(', ');
}

try {
  const where = providerKey
    ? { providerKey }
    : { baseUrl: oldBaseUrl };
  const providers = await prisma.upstreamProvider.findMany({
    where,
    include: { models: { select: { id: true, name: true, type: true, status: true } } },
    orderBy: { providerKey: 'asc' },
  });

  if (!providers.length) {
    console.log('没有找到需要更新的 provider。下面列出仍包含 43 或 45 的 provider 供核对：');
  } else {
    console.log(`将更新 provider 数量: ${providers.length}`);
    for (const item of providers) {
      console.log(`- ${item.providerKey} | ${item.name} | ${item.baseUrl} | models=${modelSummary(item)}`);
    }
  }

  if (!dryRun && providers.length) {
    for (const item of providers) {
      await prisma.upstreamProvider.update({
        where: { id: item.id },
        data: { baseUrl: newBaseUrl },
      });
    }
    console.log(`已更新数据库 baseUrl -> ${newBaseUrl}`);
  } else if (dryRun) {
    console.log('DRY_RUN=1，仅预览，不写数据库');
  }

  const verify = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { baseUrl: oldBaseUrl },
        { baseUrl: newBaseUrl },
        { providerKey: { contains: 'gpt-image' } },
        { name: { contains: 'GPT-Image' } },
      ],
    },
    include: { models: { select: { id: true, name: true, type: true, status: true } } },
    orderBy: { providerKey: 'asc' },
  });

  console.log('==> 当前相关 provider：');
  for (const item of verify) {
    console.log(`- ${item.providerKey} | ${item.name} | ${item.baseUrl} | ${item.endpointPath || ''} | ${modelSummary(item)}`);
  }
} finally {
  await prisma.$disconnect();
}
NODE

echo "==> 3/4 更新画布模型 JSON，避免之后 sync-canvas-models 覆盖回旧地址"
if [[ -d "${CANVAS_MODELS_DIR}" ]]; then
  mapfile -d '' MODEL_FILES < <(find "${CANVAS_MODELS_DIR}" -type f -name '*.json' ! -name '._*' -print0)
  changed=0
  for file in "${MODEL_FILES[@]}"; do
    if grep -qF "${OLD_BASE_URL}" "${file}"; then
      echo "替换: ${file}"
      if [[ "${DRY_RUN}" != "1" ]]; then
        perl -0pi -e "s#\Q${OLD_BASE_URL}\E#${NEW_BASE_URL}#g" "${file}"
      fi
      changed=$((changed + 1))
    fi
  done
  echo "画布模型 JSON 命中旧地址文件数: ${changed}"
else
  echo "警告：画布模型目录不存在，跳过 JSON 更新"
fi

echo "==> 4/4 可选同步校验"
if [[ "${DRY_RUN}" != "1" && -f "${BACKEND_DIR}/dist/sync-canvas-models.js" && -d "${CANVAS_MODELS_DIR}" ]]; then
  echo "如需强制用 JSON 覆盖数据库，手动运行："
  echo "cd \"${BACKEND_DIR%/api-server}\""
  echo "sudo env CANVAS_MODELS_DIR=\"${CANVAS_MODELS_DIR}\" SYNC_CANVAS_MODELS_OVERWRITE=true node api-server/dist/sync-canvas-models.js"
fi

echo "完成。若后台进程有模型缓存，请重启 ai-admin-api。"
