#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d%H%M%S)"
NAME="veo-task-id-extraction-fix-$STAMP"
PKG_DIR="$ROOT/deploy-packages/$NAME"
ARCHIVE="$ROOT/deploy-packages/$NAME.tar.gz"
NODE_BIN="${NODE_BIN:-/Users/billy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
NPM_BIN="$(dirname "$NODE_BIN")"

cd "$ROOT/api-server"
PATH="$NPM_BIN:$PATH" ./node_modules/.bin/tsc -p tsconfig.json --noEmit
PATH="$NPM_BIN:$PATH" ./node_modules/.bin/tsc -p tsconfig.json

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/ai-admin-platform/api-server/src" "$PKG_DIR/ai-admin-platform/api-server/dist"
cp -a "$ROOT/api-server/src/upstream.ts" "$PKG_DIR/ai-admin-platform/api-server/src/upstream.ts"
cp -a "$ROOT/api-server/dist/upstream.js" "$PKG_DIR/ai-admin-platform/api-server/dist/upstream.js"

tar -C "$PKG_DIR" -czf "$ARCHIVE" ai-admin-platform

echo "$ARCHIVE"
