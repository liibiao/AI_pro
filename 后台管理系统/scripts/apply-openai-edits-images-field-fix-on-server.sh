#!/usr/bin/env bash
set -euo pipefail

TARBALL="${1:-}"
if [[ -z "$TARBALL" || ! -f "$TARBALL" ]]; then
  echo "用法: sudo $0 /tmp/openai-edits-images-field-fix-YYYYMMDDHHMMSS.tar.gz" >&2
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/var/www/ai-admin/backups"
STAMP="$(date +%Y%m%d%H%M%S)"
NAME="openai-edits-images-field-fix-${STAMP}"
WORKDIR="/tmp/${NAME}"
BACKUP_DIR="${BACKUP_ROOT}/${NAME}"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR" "$BACKUP_DIR"

echo "==> 解包 $TARBALL"
tar -xzf "$TARBALL" -C "$WORKDIR"
PKG_ROOT="$WORKDIR"
if [[ ! -f "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js" ]]; then
  nested="$(find "$WORKDIR" -path '*/api-server/dist/modules/generation/adapters/registry.js' -print -quit)"
  if [[ -n "$nested" ]]; then
    PKG_ROOT="${nested%/api-server/dist/modules/generation/adapters/registry.js}"
  fi
fi

if [[ ! -f "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js" ]]; then
  echo "Error: 压缩包结构不符合预期，未找到 api-server/dist/modules/generation/adapters/registry.js" >&2
  exit 1
fi

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/api-server/src/modules/generation/adapters" "$BACKUP_DIR/api-server/dist/modules/generation/adapters"
cp -a "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 覆盖后端 generation adapter"
mkdir -p "$APP_ROOT/api-server/dist/modules/generation/adapters"
cp -a "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
if [[ -f "$PKG_ROOT/api-server/src/modules/generation/adapters/registry.ts" && -d "$APP_ROOT/api-server/src/modules/generation/adapters" ]]; then
  cp -a "$PKG_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
fi

echo "==> 重启后端"
if command -v pm2 >/dev/null 2>&1; then
  if sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 list 2>/dev/null | grep -q 'ai-admin-api'; then
    sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  else
    pm2 restart ai-admin-api --update-env
  fi
fi

echo "==> 校验"
grep -q 'images: primaryFileIds.map(fileId => ({ file_id: fileId }))' "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" && echo "files file_id images payload patched: ok"
grep -q 'images: fallbackUrls.map(url => ({ image_url: url }))' "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" && echo "cos image_url images payload patched: ok"
curl -fsS http://127.0.0.1:4000/api/health || true
echo
echo "部署完成。备份目录: $BACKUP_DIR"
