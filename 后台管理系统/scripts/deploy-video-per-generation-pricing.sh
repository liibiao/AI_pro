#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/video-per-generation-pricing-$STAMP.tar.gz"
PKG_DIR="$ROOT/deploy-packages/video-per-generation-pricing-$STAMP"
TMPDIR="$(mktemp -d /tmp/video-per-generation-pricing.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$ROOT/api-server"
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json

cd "$ROOT/admin-web"
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
"$NODE_BIN" node_modules/vite/bin/vite.js build

mkdir -p \
  "$TMPDIR/ai-admin-platform/admin-web/src" \
  "$TMPDIR/ai-admin-platform/admin-web/dist" \
  "$TMPDIR/ai-admin-platform/api-server/src" \
  "$TMPDIR/ai-admin-platform/api-server/dist" \
  "$PKG_DIR"

cp "$ROOT/admin-web/src/main.tsx" "$TMPDIR/ai-admin-platform/admin-web/src/main.tsx"
cp -a "$ROOT/admin-web/dist/." "$TMPDIR/ai-admin-platform/admin-web/dist/"
cp "$ROOT/api-server/src/billing.ts" "$TMPDIR/ai-admin-platform/api-server/src/billing.ts"
cp "$ROOT/api-server/dist/billing.js" "$TMPDIR/ai-admin-platform/api-server/dist/billing.js"
cp "$ROOT/scripts/apply-video-per-generation-pricing-on-server.sh" "$TMPDIR/apply.sh"

rm -rf "$TMPDIR/node-compile-cache"
tar -czf "$PKG" -C "$TMPDIR" .
cp "$PKG" "$PKG_DIR/$(basename "$PKG")"

shasum -a 256 "$PKG"
ls -lh "$PKG"
echo "已生成部署包：$PKG"
echo "已保存副本：$PKG_DIR/$(basename "$PKG")"
