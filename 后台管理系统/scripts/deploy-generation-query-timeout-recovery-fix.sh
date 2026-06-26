#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
SSH_TARGET="${SSH_TARGET:-ubuntu@124.156.137.236}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/generation-query-timeout-recovery-fix-$STAMP.tar.gz"
REMOTE_PKG="/tmp/$(basename "$PKG")"
TMPDIR="$(mktemp -d /tmp/generation-query-timeout-recovery-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$ROOT/api-server"
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
"$NODE_BIN" node_modules/typescript/bin/tsc -p tsconfig.json
rm -rf "$TMPDIR/node-compile-cache"

mkdir -p \
  "$TMPDIR/api-server/src/modules/generation" \
  "$TMPDIR/api-server/dist/modules/generation"
cp "$ROOT/api-server/src/modules/generation/routes.ts" "$TMPDIR/api-server/src/modules/generation/routes.ts"
cp "$ROOT/api-server/dist/modules/generation/routes.js" "$TMPDIR/api-server/dist/modules/generation/routes.js"
cp "$ROOT/scripts/apply-generation-query-timeout-recovery-fix-on-server.sh" "$TMPDIR/apply.sh"
tar -czf "$PKG" -C "$TMPDIR" .

shasum -a 256 "$PKG"
ls -lh "$PKG"

if [[ "$SKIP_UPLOAD" == "1" ]]; then
  echo "已生成部署包：$PKG"
  exit 0
fi

scp "$PKG" "$SSH_TARGET:$REMOTE_PKG"
ssh "$SSH_TARGET" "tar -xOf '$REMOTE_PKG' ./apply.sh > /tmp/apply-generation-query-timeout-recovery-fix.sh && chmod +x /tmp/apply-generation-query-timeout-recovery-fix.sh && /tmp/apply-generation-query-timeout-recovery-fix.sh '$REMOTE_PKG'"
