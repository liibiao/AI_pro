#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "用法: sudo $0 /tmp/generation-result-filename-serve-fix-*.tar.gz"
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/var/www/ai-admin/backups/generation-result-filename-serve-fix-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> 解包 $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "==> 备份线上文件到 $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/api-server/dist/modules/generation/adapters" "$BACKUP_ROOT/api-server/src/modules/generation/adapters"
cp -f "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_ROOT/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_ROOT/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true

echo "==> 覆盖生成结果文件服务校验"
cp -f "$WORK_DIR/api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
if [[ -d "$APP_ROOT/api-server/src/modules/generation/adapters" ]]; then
  cp -f "$WORK_DIR/api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
fi

echo "==> 重启后端"
sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env

echo "==> 校验"
for i in {1..20}; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    curl -fsS http://127.0.0.1:4000/api/health
    echo
    break
  fi
  sleep 1
done
grep -Fq '^[\\w.-]+' "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" && echo "generation result filename underscore serve patched: ok"

echo "部署完成。备份目录: $BACKUP_ROOT"
