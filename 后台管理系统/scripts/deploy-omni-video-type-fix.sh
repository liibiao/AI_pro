#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
WORKBENCH="/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/omni-video-type-fix-$STAMP.tar.gz"
TMPDIR="$(mktemp -d /tmp/omni-video-type-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

"$NODE_BIN" - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const main=scripts.reduce((a,b)=>b.length>a.length?b:a,'');
fs.writeFileSync('/tmp/image-studio-canvas-next-main-script.js',main);
NODE
"$NODE_BIN" --check /tmp/image-studio-canvas-next-main-script.js

mkdir -p "$TMPDIR/workbench-web"
cp "$WORKBENCH/image-studio-canvas-next.html" "$TMPDIR/workbench-web/image-studio-canvas-next.html"
cp "$ROOT/scripts/apply-omni-video-type-fix-on-server.sh" "$TMPDIR/apply.sh"
COPYFILE_DISABLE=1 tar -czf "$PKG" -C "$TMPDIR" .

shasum -a 256 "$PKG"
ls -lh "$PKG"

if [[ "$SKIP_UPLOAD" == "1" ]]; then
  echo "已生成部署包：$PKG"
  exit 0
fi

/Users/billy/.codex/skills/canvas-package-deploy/scripts/deploy_canvas_package.sh \
  --target 124 \
  --archive "$PKG" \
  --script "$ROOT/scripts/apply-omni-video-type-fix-on-server.sh"
