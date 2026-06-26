#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://admin.imuai.space/workbench-web}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$BASE/image-studio-canvas-next.html?v=video-node-fail-retry-fix-202605280916" -o "$TMP/canvas.html"
grep -q "cancelRunNode" "$TMP/canvas.html"
grep -q "停止生成" "$TMP/canvas.html"
grep -q "视频生成等待超时" "$TMP/canvas.html"
grep -q "生成失败，可修改提示词后重新生成" "$TMP/canvas.html"
echo "OK video node retry fix verified: $BASE/image-studio-canvas-next.html?v=video-node-fail-retry-fix-202605280916"
