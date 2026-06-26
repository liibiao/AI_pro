#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://124.156.137.236}"
STAMP="$(date +%Y%m%d%H%M%S)"
HTML="$(mktemp)"; CSS="$(mktemp)"; trap 'rm -f "$HTML" "$CSS"' EXIT
curl -fsSL "$BASE/image-studio-canvas-next.html?v=$STAMP" -o "$HTML"
grep -n '<title>智能视界</title>' "$HTML"
if grep -q 'TapNow 风格节点工作流' "$HTML"; then echo '验证失败：旧标题仍存在' >&2; exit 2; fi
curl -fsSL "$BASE/canvas-next/tapnow-rewrite.css?v=$STAMP" -o "$CSS"
BYTES_HTML=$(wc -c < "$HTML" | tr -d ' ')
BYTES_CSS=$(wc -c < "$CSS" | tr -d ' ')
if [[ "$BYTES_HTML" -lt 100000 ]]; then echo "验证失败：HTML 过小 $BYTES_HTML" >&2; exit 3; fi
if [[ "$BYTES_CSS" -lt 1000 ]]; then echo "验证失败：CSS 过小 $BYTES_CSS" >&2; exit 4; fi
echo "验证通过：HTML ${BYTES_HTML} bytes，CSS ${BYTES_CSS} bytes"
echo "$BASE/image-studio-canvas-next.html?v=$STAMP"
