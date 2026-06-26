#!/usr/bin/env bash
set -euo pipefail

TARBALL="${1:-}"
if [[ -z "$TARBALL" || ! -f "$TARBALL" ]]; then
  echo "用法: sudo $0 /tmp/model-upload-mode-save-fix-YYYYMMDDHHMMSS.tar.gz" >&2
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/var/www/ai-admin/backups"
STAMP="$(date +%Y%m%d%H%M%S)"
NAME="model-upload-mode-save-fix-${STAMP}"
WORKDIR="/tmp/${NAME}"
BACKUP_DIR="${BACKUP_ROOT}/${NAME}"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR" "$BACKUP_DIR"

echo "==> 解包 $TARBALL"
tar -xzf "$TARBALL" -C "$WORKDIR"
PKG_ROOT="$WORKDIR"
if [[ ! -f "$PKG_ROOT/api-server/dist/modules/models/routes.js" ]]; then
  nested="$(find "$WORKDIR" -path '*/api-server/dist/modules/models/routes.js' -print -quit)"
  if [[ -n "$nested" ]]; then
    PKG_ROOT="${nested%/api-server/dist/modules/models/routes.js}"
  fi
fi

if [[ ! -f "$PKG_ROOT/api-server/dist/modules/models/routes.js" ]]; then
  echo "Error: 压缩包结构不符合预期，未找到 api-server/dist/modules/models/routes.js" >&2
  exit 1
fi

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/api-server/src/modules/models" "$BACKUP_DIR/api-server/dist/modules/models"
cp -a "$APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/api-server/dist/modules/models/routes.js"

echo "==> 覆盖模型管理后端文件"
mkdir -p "$APP_ROOT/api-server/dist/modules/models"
cp -a "$PKG_ROOT/api-server/dist/modules/models/routes.js" "$APP_ROOT/api-server/dist/modules/models/routes.js"
if [[ -f "$PKG_ROOT/api-server/src/modules/models/routes.ts" && -d "$APP_ROOT/api-server/src/modules/models" ]]; then
  cp -a "$PKG_ROOT/api-server/src/modules/models/routes.ts" "$APP_ROOT/api-server/src/modules/models/routes.ts"
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
grep -q "input.uploadMode === undefined ? adapterConfig.uploadMode : normalizeUploadMode(input.uploadMode)" "$APP_ROOT/api-server/dist/modules/models/routes.js" && echo "model upload mode explicit default save patched: ok"
curl -fsS http://127.0.0.1:4000/api/health || true
echo
echo "部署完成。备份目录: $BACKUP_DIR"
