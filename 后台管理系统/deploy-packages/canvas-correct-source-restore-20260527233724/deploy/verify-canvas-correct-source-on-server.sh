#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://124.156.137.236/image-studio-canvas-next.html}"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
curl -fsSL "$URL?v=$(date +%Y%m%d%H%M%S)" -o "$TMP"
grep -n '<title>智能视界</title>' "$TMP"
if grep -q 'TapNow 风格节点工作流' "$TMP"; then echo '验证失败：仍是旧标题' >&2; exit 2; fi
if ! grep -q '<!DOCTYPE html>' "$TMP"; then echo '验证失败：返回内容不是完整 HTML' >&2; exit 3; fi
BYTES=$(wc -c < "$TMP" | tr -d ' ')
echo "验证通过：$URL，大小 ${BYTES} bytes"
