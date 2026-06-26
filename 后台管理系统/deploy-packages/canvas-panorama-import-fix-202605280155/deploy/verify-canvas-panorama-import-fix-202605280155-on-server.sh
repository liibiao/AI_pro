#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://admin.imuai.space/workbench-web}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$BASE/image-studio-canvas-next.html?v=canvas-panorama-import-fix-202605280155" -o "$TMP/canvas.html"
grep -q "assetCategory:'panorama'" "$TMP/canvas.html"
grep -q "imagePreviewUrl(uploaded)" "$TMP/canvas.html"
grep -q "全景图已导入 720 查看节点" "$TMP/canvas.html"
grep -q "data-pano-viewer" "$TMP/canvas.html"
echo "OK panorama import fix verified: $BASE/image-studio-canvas-next.html?v=canvas-panorama-import-fix-202605280155"
