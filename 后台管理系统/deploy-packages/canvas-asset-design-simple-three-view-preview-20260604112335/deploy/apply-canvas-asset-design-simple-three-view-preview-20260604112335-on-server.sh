#!/usr/bin/env bash
set -euo pipefail

PKG="canvas-asset-design-simple-three-view-preview-20260604112335"
TARBALL="/tmp/${PKG}.tar.gz"
WORKDIR="/tmp/${PKG}"
STAMP="$(date +%Y%m%d%H%M%S)"

if [[ ! -f "${TARBALL}" ]]; then
  echo "Package not found: ${TARBALL}" >&2
  exit 1
fi

rm -rf "${WORKDIR}"
tar -xzf "${TARBALL}" -C /tmp

install_file() {
  local rel="$1"
  local dest="$2"
  local src="${WORKDIR}/files/${rel}"
  if [[ ! -f "${src}" ]]; then
    echo "Missing package file: ${src}" >&2
    exit 1
  fi
  mkdir -p "$(dirname "${dest}")"
  if [[ -f "${dest}" ]]; then
    cp -p "${dest}" "${dest}.bak-${STAMP}"
  fi
  install -m 0644 "${src}" "${dest}"
  echo "Installed ${dest}"
}

install_tree() {
  local root="$1"
  [[ -d "${root}" ]] || return 0
  install_file "tools/workbench-web/image-studio-canvas-next.html" "${root}/image-studio-canvas-next.html"
  install_file "tools/workbench-web/canvas-next/tapnow-rewrite.css" "${root}/canvas-next/tapnow-rewrite.css"
  install_file "tools/workbench-web/assets/template-previews/simple-three-view-sheet.png" "${root}/assets/template-previews/simple-three-view-sheet.png"
}

install_tree "/var/www/ai-admin/workbench-web"
install_tree "/home/ubuntu/漫剧创作库/tools/workbench-web"

grep -q "20260604-asset-design-simple-three-view-preview" /var/www/ai-admin/workbench-web/image-studio-canvas-next.html
grep -q "simple_three_view_sheet" /var/www/ai-admin/workbench-web/image-studio-canvas-next.html
grep -q "previewAssetDesignLarge" /var/www/ai-admin/workbench-web/image-studio-canvas-next.html
grep -q "asset design preview is image/progress only" /var/www/ai-admin/workbench-web/canvas-next/tapnow-rewrite.css
test -f /var/www/ai-admin/workbench-web/assets/template-previews/simple-three-view-sheet.png

echo "Deploy ${PKG} done."
