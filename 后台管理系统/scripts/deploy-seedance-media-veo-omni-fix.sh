#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
WORKBENCH="/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/seedance-media-veo-omni-fix-$STAMP.tar.gz"
TMPDIR="$(mktemp -d /tmp/seedance-media-veo-omni-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$ROOT/api-server"
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json

"$NODE_BIN" - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const main=scripts.reduce((a,b)=>b.length>a.length?b:a,'');
fs.writeFileSync('/tmp/image-studio-canvas-next-main-script.js',main);
NODE
"$NODE_BIN" --check /tmp/image-studio-canvas-next-main-script.js

mkdir -p \
  "$TMPDIR/api-server/src/modules/generation/adapters" \
  "$TMPDIR/api-server/src/modules/generation" \
  "$TMPDIR/api-server/dist/modules/generation/adapters" \
  "$TMPDIR/api-server/dist/modules/generation" \
  "$TMPDIR/workbench-web"
cp "$ROOT/api-server/src/modules/generation/adapters/registry.ts" "$TMPDIR/api-server/src/modules/generation/adapters/registry.ts"
cp "$ROOT/api-server/src/modules/generation/routes.ts" "$TMPDIR/api-server/src/modules/generation/routes.ts"
cp "$ROOT/api-server/dist/modules/generation/adapters/registry.js" "$TMPDIR/api-server/dist/modules/generation/adapters/registry.js"
cp "$ROOT/api-server/dist/modules/generation/routes.js" "$TMPDIR/api-server/dist/modules/generation/routes.js"
cp "$WORKBENCH/image-studio-canvas-next.html" "$TMPDIR/workbench-web/image-studio-canvas-next.html"
cp "$ROOT/scripts/apply-seedance-media-veo-omni-fix-on-server.sh" "$TMPDIR/apply.sh"
rm -rf "$TMPDIR/node-compile-cache"
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
  --script "$ROOT/scripts/apply-seedance-media-veo-omni-fix-on-server.sh"
