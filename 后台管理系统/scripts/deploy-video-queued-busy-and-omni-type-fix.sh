#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
CANVAS_ROOT="/Users/billy/Documents/AI_pro/漫剧创作库"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/video-queued-busy-and-omni-type-fix-$STAMP.tar.gz"
PKG_DIR="$ROOT/deploy-packages/video-queued-busy-and-omni-type-fix-$STAMP"
TMPDIR="$(mktemp -d /tmp/video-queued-busy-and-omni-type-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$ROOT/api-server"
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json

mkdir -p \
  "$TMPDIR/api-server/src/modules/generation/adapters" \
  "$TMPDIR/api-server/dist/modules/generation/adapters" \
  "$TMPDIR/api-server/src/modules/workbench-compat" \
  "$TMPDIR/api-server/dist/modules/workbench-compat" \
  "$TMPDIR/workbench-web" \
  "$PKG_DIR"

cp "$ROOT/api-server/src/modules/generation/adapters/registry.ts" \
  "$TMPDIR/api-server/src/modules/generation/adapters/registry.ts"
cp "$ROOT/api-server/dist/modules/generation/adapters/registry.js" \
  "$TMPDIR/api-server/dist/modules/generation/adapters/registry.js"
cp "$ROOT/api-server/src/modules/workbench-compat/routes.ts" \
  "$TMPDIR/api-server/src/modules/workbench-compat/routes.ts"
cp "$ROOT/api-server/dist/modules/workbench-compat/routes.js" \
  "$TMPDIR/api-server/dist/modules/workbench-compat/routes.js"
cp "$CANVAS_ROOT/tools/workbench-web/image-studio-canvas-next.html" \
  "$TMPDIR/workbench-web/image-studio-canvas-next.html"
cp "$ROOT/scripts/apply-video-queued-busy-and-omni-type-fix-on-server.sh" \
  "$TMPDIR/apply.sh"

rm -rf "$TMPDIR/node-compile-cache"
tar -czf "$PKG" -C "$TMPDIR" .
cp "$PKG" "$PKG_DIR/$(basename "$PKG")"

shasum -a 256 "$PKG"
ls -lh "$PKG"
echo "已生成部署包：$PKG"
echo "已保存副本：$PKG_DIR/$(basename "$PKG")"
