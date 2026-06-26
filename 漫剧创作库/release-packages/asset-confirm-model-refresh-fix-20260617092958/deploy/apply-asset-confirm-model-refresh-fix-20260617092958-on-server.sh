#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_ROOT="/var/www/ai-admin/workbench-web"
TOOLS_ROOT="${APP_ROOT}/tools/workbench-web"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_ROOT="${APP_ROOT}/.deploy-backups/asset-confirm-model-refresh-fix-20260617092958-${STAMP}"
TMP_DIR="$(mktemp -d)"

cleanup(){
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

must_have(){
  local file="$1"
  local needle="$2"
  if ! grep -Fq -- "${needle}" "${file}"; then
    echo "Missing marker in ${file}: ${needle}" >&2
    exit 1
  fi
}

check_file(){
  local file="$1"
  test -s "${file}"
  must_have "${file}" "function resetAssetConfirmCardRecoveryState"
  must_have "${file}" "function clearAssetCardMidjourneyRuntimeValues"
  must_have "${file}" "clearAssetCardMidjourneyRuntimeValues({})"
  must_have "${file}" "assetConfirmRunId"
  must_have "${file}" "if(activeReplacement)return out"
  must_have "${file}" "if(['queued','starting','running'].includes(status))return false"
  must_have "${file}" "requestedModelKey"
  must_have "${file}" "resetAssetConfirmCardRecoveryState(id,card.id)"
}

backup_file(){
  local file="$1"
  local rel="$2"
  if [ -f "${file}" ]; then
    mkdir -p "${BACKUP_ROOT}/$(dirname "${rel}")"
    cp -p "${file}" "${BACKUP_ROOT}/${rel}"
  fi
}

tar -xzf "${ARCHIVE}" -C "${TMP_DIR}"

SRC_PUBLIC="${TMP_DIR}/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="${TMP_DIR}/tools/workbench-web/image-studio-canvas-next.html"

check_file "${SRC_PUBLIC}"
check_file "${SRC_TOOLS}"

mkdir -p "${PUBLIC_ROOT}" "${TOOLS_ROOT}"
backup_file "${PUBLIC_ROOT}/image-studio-canvas-next.html" "var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
backup_file "${TOOLS_ROOT}/image-studio-canvas-next.html" "home-ubuntu-repo/tools/workbench-web/image-studio-canvas-next.html"

install -m 0644 "${SRC_PUBLIC}" "${PUBLIC_ROOT}/image-studio-canvas-next.html"
install -m 0644 "${SRC_TOOLS}" "${TOOLS_ROOT}/image-studio-canvas-next.html"

check_file "${PUBLIC_ROOT}/image-studio-canvas-next.html"
check_file "${TOOLS_ROOT}/image-studio-canvas-next.html"

echo "deployed=asset-confirm-model-refresh-fix-20260617092958"
echo "backup=${BACKUP_ROOT}"
echo "public=${PUBLIC_ROOT}/image-studio-canvas-next.html"
echo "tools=${TOOLS_ROOT}/image-studio-canvas-next.html"
