#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/billy/Documents/AI_pro/后台管理系统"
WORKBENCH="/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web"
SSH_TARGET="${SSH_TARGET:-ubuntu@124.156.137.236}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
PKG="/tmp/canvas-backend-gateway-routing-fix-${STAMP}.tar.gz"
REMOTE_PKG="/tmp/canvas-backend-gateway-routing-fix-${STAMP}.tar.gz"

echo "==> 本地构建后端"
cd "$ROOT"
npm run build --prefix api-server

echo "==> 本地检查画布脚本语法"
node --check "$WORKBENCH/canvas-next/generation-service.js"
node - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const main=scripts.reduce((a,b)=>b.length>a.length?b:a,'');
fs.writeFileSync('/tmp/image-studio-canvas-next-main-script.js',main);
console.log(`inline scripts=${scripts.length}, checked main script bytes=${main.length}`);
NODE
node --check /tmp/image-studio-canvas-next-main-script.js

echo "==> 生成部署包: $PKG"
TMPDIR="$(mktemp -d /tmp/canvas-gateway-fix.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT
mkdir -p \
  "$TMPDIR/ai-admin-platform/api-server/src/modules/generation" \
  "$TMPDIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$TMPDIR/ai-admin-platform/api-server/src/modules/models" \
  "$TMPDIR/ai-admin-platform/api-server/dist/modules/models" \
  "$TMPDIR/workbench-web/canvas-next"

cp "$ROOT/scripts/apply-canvas-gateway-fix-on-server.sh" "$TMPDIR/apply-canvas-gateway-fix-on-server.sh"
cp "$ROOT/api-server/src/modules/generation/routes.ts" "$TMPDIR/ai-admin-platform/api-server/src/modules/generation/routes.ts"
cp "$ROOT/api-server/dist/modules/generation/routes.js" "$TMPDIR/ai-admin-platform/api-server/dist/modules/generation/routes.js"
cp "$ROOT/api-server/src/modules/models/routes.ts" "$TMPDIR/ai-admin-platform/api-server/src/modules/models/routes.ts"
cp "$ROOT/api-server/dist/modules/models/routes.js" "$TMPDIR/ai-admin-platform/api-server/dist/modules/models/routes.js"
cp "$WORKBENCH/image-studio-canvas-next.html" "$TMPDIR/workbench-web/image-studio-canvas-next.html"
cp "$WORKBENCH/canvas-next/generation-service.js" "$TMPDIR/workbench-web/canvas-next/generation-service.js"

tar -czf "$PKG" -C "$TMPDIR" .
shasum -a 256 "$PKG"
ls -lh "$PKG"

echo "==> 上传部署包到服务器: $SSH_TARGET"
scp "$PKG" "$SSH_TARGET:$REMOTE_PKG"

echo "==> 服务器解包、备份、覆盖、重启"
ssh "$SSH_TARGET" "REMOTE_ROOT='$REMOTE_ROOT' REMOTE_API_ROOT='$REMOTE_API_ROOT' REMOTE_WORKBENCH_ROOT='$REMOTE_WORKBENCH_ROOT' REMOTE_PKG='$REMOTE_PKG' STAMP='$STAMP' bash -s" <<'REMOTE'
set -euo pipefail

DEPLOY_DIR="/tmp/canvas-gateway-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-gateway-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
tar -xzf "$REMOTE_PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/workbench-web/canvas-next"

cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
mkdir -p "$REMOTE_WORKBENCH_ROOT/canvas-next"
cp -a "$DEPLOY_DIR/workbench-web/canvas-next/generation-service.js" "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js"

echo "==> 重启后端"
pm2 restart ai-admin-api

echo "==> 校验服务"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
curl -sS http://127.0.0.1/image-studio-canvas-next.html | grep -q "resolveBackendGatewayModelCandidate"
echo "canvas html patched: ok"
curl -sS http://127.0.0.1/api/health 2>/dev/null || true
echo
echo "部署完成。备份目录: $BACKUP_DIR"
REMOTE

echo "==> 完成"
echo "访问时用强制刷新链接："
echo "http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
