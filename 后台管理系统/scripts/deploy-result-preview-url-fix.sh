#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
WORKBENCH="/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web"
SSH_TARGET="${SSH_TARGET:-ubuntu@124.156.137.236}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/result-preview-url-fix-${STAMP}.tar.gz"
REMOTE_PKG="/tmp/result-preview-url-fix-${STAMP}.tar.gz"

cd "$ROOT"
echo "==> 构建后端"
npm run build --prefix api-server

echo "==> 构建后台管理前端"
npm run build --prefix admin-web

echo "==> 检查画布脚本语法"
node --check "$WORKBENCH/canvas-next/generation-service.js"
node - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const main=scripts.reduce((a,b)=>b.length>a.length?b:a,'');
fs.writeFileSync('/tmp/image-studio-canvas-next-main-script.js',main);
NODE
node --check /tmp/image-studio-canvas-next-main-script.js

echo "==> 生成部署包: $PKG"
TMPDIR="$(mktemp -d /tmp/result-preview-url-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT
mkdir -p \
  "$TMPDIR/ai-admin-platform/api-server/src" \
  "$TMPDIR/ai-admin-platform/api-server/dist" \
  "$TMPDIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$TMPDIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$TMPDIR/ai-admin-platform/admin-web" \
  "$TMPDIR/workbench-web/canvas-next"

cp "$ROOT/scripts/apply-result-preview-url-fix-on-server.sh" "$TMPDIR/apply-result-preview-url-fix-on-server.sh"
cp "$ROOT/api-server/src/config.ts" "$TMPDIR/ai-admin-platform/api-server/src/config.ts"
cp "$ROOT/api-server/dist/config.js" "$TMPDIR/ai-admin-platform/api-server/dist/config.js"
cp "$ROOT/api-server/src/modules/generation/adapters/registry.ts" "$TMPDIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
cp "$ROOT/api-server/dist/modules/generation/adapters/registry.js" "$TMPDIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$ROOT/admin-web/dist" "$TMPDIR/ai-admin-platform/admin-web/dist"
cp "$WORKBENCH/image-studio-canvas-next.html" "$TMPDIR/workbench-web/image-studio-canvas-next.html"
cp "$WORKBENCH/workbench-engine.js" "$TMPDIR/workbench-web/workbench-engine.js"
cp "$WORKBENCH/canvas-next/generation-service.js" "$TMPDIR/workbench-web/canvas-next/generation-service.js"

tar -czf "$PKG" -C "$TMPDIR" .
shasum -a 256 "$PKG"
ls -lh "$PKG"

echo "==> 尝试上传并自动部署: $SSH_TARGET"
if [[ "$SKIP_UPLOAD" == "1" ]]; then
  echo "==> 已跳过上传。部署包已生成: $PKG"
  echo "==> 上传到主平台服务器 /tmp/ 后执行:"
  echo "tar -xOf $PKG ./apply-result-preview-url-fix-on-server.sh > /tmp/apply-result-preview-url-fix-on-server.sh"
  echo "chmod +x /tmp/apply-result-preview-url-fix-on-server.sh"
  echo "/tmp/apply-result-preview-url-fix-on-server.sh $PKG"
  exit 0
fi
scp "$PKG" "$SSH_TARGET:$REMOTE_PKG"
ssh "$SSH_TARGET" "chmod +x /tmp/apply-result-preview-url-fix-on-server.sh 2>/dev/null || true; tar -xzf '$REMOTE_PKG' -C /tmp result-preview-url-fix-dummy 2>/dev/null || true"
ssh "$SSH_TARGET" "tar -xOf '$REMOTE_PKG' ./apply-result-preview-url-fix-on-server.sh > /tmp/apply-result-preview-url-fix-on-server.sh && chmod +x /tmp/apply-result-preview-url-fix-on-server.sh && /tmp/apply-result-preview-url-fix-on-server.sh '$REMOTE_PKG'"

echo "==> 完成"
