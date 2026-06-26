#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://124.156.137.236}"
HTML="$(mktemp)"; CSS="$(mktemp)"
curl -fsSL "$BASE/image-studio-canvas-next.html?v=$(date +%s)" -o "$HTML"
curl -fsSL "$BASE/canvas-next/tapnow-rewrite.css?v=$(date +%s)" -o "$CSS"
grep -n "createAudioNodeFromVideoNode" "$HTML"
grep -n "data-single-video-extract-audio" "$HTML"
grep -n "const uploadMedia={...media,audioUrl:''" "$HTML"
grep -n "hoverPort" "$HTML"
grep -n "scheduleAttachNodePanoViewer" "$HTML"
grep -n "pointer-events:none!important" "$CSS"
echo "线上验证通过: $BASE/image-studio-canvas-next.html"
