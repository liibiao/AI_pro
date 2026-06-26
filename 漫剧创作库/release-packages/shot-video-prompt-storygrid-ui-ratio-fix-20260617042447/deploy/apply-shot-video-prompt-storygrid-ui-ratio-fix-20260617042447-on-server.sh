#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/home/ubuntu/漫剧创作库"
PUBLIC_ROOT="/var/www/ai-admin/workbench-web"
TOOLS_ROOT="${APP_ROOT}/tools/workbench-web"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_ROOT="${APP_ROOT}/.deploy-backups/shot-video-prompt-storygrid-ui-ratio-fix-20260617042447-${STAMP}"
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
  must_have "${file}" "20260617-final-director-action-method-v5"
  must_have "${file}" "svp-storyboard-config"
  must_have "${file}" "shotVideoPromptStoryboardCellRatio"
  must_have "${file}" "_shotVideoPromptCanvasRatio"
  must_have "${file}" "_shotVideoPromptCellRatio"
  must_have "${file}" "createShotVideoPromptStoryboardEditor"
  must_have "${file}" "id=\"_svpPromptEdit\" class=\"svp-edit-textbox\" contenteditable=\"true\""
  must_have "${file}" "data-svp-field=\"storyboardTemplate\""
  must_have "${file}" "data-svp-action=\"editStoryboardGrid\""
  must_have "${file}" "findSpawnPositionNearNode(anchor.id||sourceId,'shotVideoPrompt'"
  must_have "${file}" "internal-backing-node"
  if grep -Fq -- "selectNode(storyId)" "${file}"; then
    echo "Unexpected hidden storyboard node selection remains in ${file}" >&2
    exit 1
  fi
  if grep -Fq -- "<textarea id=\"_svpPromptEdit" "${file}"; then
    echo "Unexpected duplicate textarea editor remains in ${file}" >&2
    exit 1
  fi
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

echo "deployed=shot-video-prompt-storygrid-ui-ratio-fix-20260617042447"
echo "backup=${BACKUP_ROOT}"
echo "public=${PUBLIC_ROOT}/image-studio-canvas-next.html"
echo "tools=${TOOLS_ROOT}/image-studio-canvas-next.html"
