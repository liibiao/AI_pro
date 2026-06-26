#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://124.156.137.236}"
STAMP="$(date +%Y%m%d%H%M%S)"
HTML="$(mktemp)"; trap 'rm -f "$HTML"' EXIT
curl -fsSL "$BASE/image-studio-canvas-next.html?v=$STAMP" -o "$HTML"
grep -n '<title>智能视界</title>' "$HTML"
grep -n "const on=(id,handler,event='onclick')" "$HTML"
if grep -q 'TapNow 风格节点工作流' "$HTML"; then echo '验证失败：旧标题仍存在' >&2; exit 2; fi
BYTES=$(wc -c < "$HTML" | tr -d ' ')
[[ "$BYTES" -gt 100000 ]] || { echo "验证失败：HTML 过小 $BYTES" >&2; exit 3; }
echo "验证通过：HTML ${BYTES} bytes"
echo "$BASE/image-studio-canvas-next.html?v=$STAMP"
