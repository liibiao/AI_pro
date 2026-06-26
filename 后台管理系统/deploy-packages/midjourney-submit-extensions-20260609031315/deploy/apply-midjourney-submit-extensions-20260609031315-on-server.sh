#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/midjourney-submit-extensions-20260609031315.tar.gz}"
PKG_NAME="midjourney-submit-extensions-20260609031315"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="${API_DIR:-$BACKEND_DIR/api-server}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-$MIRROR_ROOT/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/${PKG_NAME}-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/${PKG_NAME}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
run_as_pm2_user(){
  if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -u "$PM2_USER" bash -lc "$*"
  else
    bash -lc "$*"
  fi
}

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$API_DIR" || { echo "后台 API 目录不存在: $API_DIR" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "线上画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/$PKG_NAME"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
REGISTRY="$SRC/backend/api-server/src/modules/generation/adapters/registry.ts"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -f "$REGISTRY" || { echo "部署包缺少 registry.ts" >&2; exit 1; }

grep -q "MIDJOURNEY_FUNCTION_OPTIONS" "$HTML" || { echo "画布缺少 MJ 功能胶囊标记" >&2; exit 2; }
grep -q "data-mj-ext-submit" "$HTML" || { echo "画布缺少 MJ 扩展提交按钮标记" >&2; exit 2; }
grep -q "mjTaskKind" "$HTML" || { echo "画布缺少 mjTaskKind 参数标记" >&2; exit 2; }
grep -q "submitMidjourneyExtensionTask" "$HTML" || { echo "画布缺少 MJ 扩展提交逻辑" >&2; exit 2; }

grep -q "MIDJOURNEY_SPECIAL_ENDPOINTS" "$REGISTRY" || { echo "后台缺少 MJ 特殊 endpoint 表" >&2; exit 2; }
grep -q "normalizeMidjourneySubmitKind" "$REGISTRY" || { echo "后台缺少 MJ 任务类型分流逻辑" >&2; exit 2; }
grep -q "buildMidjourneyBlendRequest" "$REGISTRY" || { echo "后台缺少 Blend 请求构建逻辑" >&2; exit 2; }
grep -q "buildMidjourneyActionRequest" "$REGISTRY" || { echo "后台缺少 Action 请求构建逻辑" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web" "$BACKUP/api-server/src/modules/generation/adapters"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$API_DIR/src/modules/generation/adapters/registry.ts" "$BACKUP/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true

log "install backend registry.ts"
run_sudo mkdir -p "$API_DIR/src/modules/generation/adapters"
run_sudo cp -f "$REGISTRY" "$API_DIR/src/modules/generation/adapters/registry.ts"
if id "$PM2_USER" >/dev/null 2>&1; then
  run_sudo chown "$PM2_USER:$PM2_USER" "$API_DIR/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
fi
run_sudo chmod 644 "$API_DIR/src/modules/generation/adapters/registry.ts" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror canvas source"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  if id "$PM2_USER" >/dev/null 2>&1; then
    run_sudo chown "$PM2_USER:$PM2_USER" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  fi
fi

log "build api-server"
if id "$PM2_USER" >/dev/null 2>&1; then
  run_sudo chown -R "$PM2_USER:$PM2_USER" "$API_DIR/dist" "$API_DIR/src/modules/generation/adapters" 2>/dev/null || true
fi
run_as_pm2_user "cd '$API_DIR' && npm run build"

log "verify installed markers"
grep -n "MIDJOURNEY_FUNCTION_OPTIONS" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "data-mj-ext-submit" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "normalizeMidjourneySubmitKind" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -n "buildMidjourneyActionRequest" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -n "normalizeMidjourneySubmitKind" "$API_DIR/dist/modules/generation/adapters/registry.js"

log "restart api"
if command -v pm2 >/dev/null 2>&1 || run_as_pm2_user "command -v pm2 >/dev/null 2>&1"; then
  run_as_pm2_user "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  echo "WARN: 未找到 pm2，请手动重启后台服务" >&2
fi

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
