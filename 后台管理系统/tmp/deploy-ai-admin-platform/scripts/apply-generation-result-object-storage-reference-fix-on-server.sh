#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/generation-result-object-storage-reference-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 generation-result-object-storage-reference-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/generation-result-object-storage-reference-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-result-object-storage-reference-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/workbench-web"

cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
if [[ -f "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" ]]; then
  cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
fi

echo "==> 重启后端"
pm2 restart ai-admin-api

echo "==> 校验"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
grep -q 'materializeGenerationResultReferenceUrl' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "generation result reference materialize patched: ok"
grep -q 'uploadImageBufferToObjectStorageBestEffort' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "generated image object storage persistence patched: ok"
grep -q 'materializeImageResultUrl' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "direct image result url materialize patched: ok"
grep -q 'uploadRemoteImageUrlToObjectStorageBestEffort' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "remote image result url object storage persistence patched: ok"
grep -q 'uploadObjectStorageBuffer' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "object storage upload helper wired: ok"
if [[ -f "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" ]]; then
  grep -q 'uploadCanvasImageEntryToObjectStorage' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
  echo "canvas derived asset object storage upload patched: ok"
fi

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
