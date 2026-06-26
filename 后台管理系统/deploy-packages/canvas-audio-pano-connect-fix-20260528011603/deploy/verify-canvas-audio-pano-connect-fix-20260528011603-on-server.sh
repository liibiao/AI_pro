#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://124.156.137.236}"
STAMP="$(date +%Y%m%d%H%M%S)"
HTML="$(mktemp)"; CSS="$(mktemp)"; trap 'rm -f "$HTML" "$CSS"' EXIT
curl -fsSL "$BASE/image-studio-canvas-next.html?v=$STAMP" -o "$HTML"
curl -fsSL "$BASE/canvas-next/tapnow-rewrite.css?v=$STAMP" -o "$CSS"
grep -n "hoverPort" "$HTML"
grep -n "function audioUrlFromPayload" "$HTML"
grep -n "scheduleAttachNodePanoViewer" "$HTML"
grep -n "pointer-events:none!important" "$CSS"
BYTES_HTML=$(wc -c < "$HTML" | tr -d ' ')
BYTES_CSS=$(wc -c < "$CSS" | tr -d ' ')
[[ "$BYTES_HTML" -gt 100000 ]] || { echo "验证失败：HTML 过小 $BYTES_HTML" >&2; exit 3; }
[[ "$BYTES_CSS" -gt 1000 ]] || { echo "验证失败：CSS 过小 $BYTES_CSS" >&2; exit 4; }
echo "验证通过：HTML ${BYTES_HTML} bytes，CSS ${BYTES_CSS} bytes"
echo "$BASE/image-studio-canvas-next.html?v=$STAMP"
