#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "用法: sudo $0 /tmp/generation-img2img-result-materialize-fix-YYYYMMDDHHMMSS.tar.gz" >&2
  exit 1
fi

ROOT="/var/www/ai-admin"
PLATFORM="${ROOT}/ai-admin-platform"
API="${PLATFORM}/api-server"
WEB="${PLATFORM}/admin-web"
TS="$(date +%Y%m%d%H%M%S)"
BACKUP="${ROOT}/backups/generation-img2img-result-materialize-fix-${TS}"
TMPDIR="$(mktemp -d /tmp/generation-img2img-result-materialize-fix.XXXXXX)"

cleanup() {
  rm -rf "${TMPDIR}"
}
trap cleanup EXIT

echo "==> 解包 ${ARCHIVE}"
tar -xzf "${ARCHIVE}" -C "${TMPDIR}"

echo "==> 备份线上文件到 ${BACKUP}"
mkdir -p "${BACKUP}/api-server/dist/modules/generation/adapters" "${BACKUP}/api-server/src/modules/generation/adapters" "${BACKUP}/admin-web"
cp "${API}/dist/modules/generation/adapters/registry.js" "${BACKUP}/api-server/dist/modules/generation/adapters/registry.js"
cp "${API}/src/modules/generation/adapters/registry.ts" "${BACKUP}/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "${WEB}/dist" "${BACKUP}/admin-web/dist"
cp "${WEB}/src/main.tsx" "${BACKUP}/admin-web/main.tsx" 2>/dev/null || true

echo "==> 覆盖后端和后台管理前端"
cp "${TMPDIR}/api-server/dist/modules/generation/adapters/registry.js" "${API}/dist/modules/generation/adapters/registry.js"
if [[ -f "${TMPDIR}/api-server/src/modules/generation/adapters/registry.ts" && -d "${API}/src/modules/generation/adapters" ]]; then
  cp "${TMPDIR}/api-server/src/modules/generation/adapters/registry.ts" "${API}/src/modules/generation/adapters/registry.ts"
fi
rm -rf "${WEB}/dist"
cp -a "${TMPDIR}/admin-web/dist" "${WEB}/dist"
if [[ -f "${TMPDIR}/admin-web/src/main.tsx" && -d "${WEB}/src" ]]; then
  cp "${TMPDIR}/admin-web/src/main.tsx" "${WEB}/src/main.tsx"
fi

echo "==> 重启后端"
sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env

echo "==> 校验"
curl -fsS http://127.0.0.1:4000/api/health || curl -fsS http://127.0.0.1:4000/health || true
grep -q "fs.writeFile(path.join(GENERATED_IMAGE_DIR, localName), bytes)" "${API}/dist/modules/generation/adapters/registry.js" && echo "remote image result local fallback patched: ok"
grep -Rqs "img2img|image-to-image|image_to_image|edit|repair|refine|panorama" "${WEB}/dist/assets" && echo "admin image task type label patched: ok"

echo "部署完成。备份目录: ${BACKUP}"
echo "后台强制刷新: http://124.156.137.236/?v=${TS}"
