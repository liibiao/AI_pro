#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/midjourney-task-management-20260609035002.tar.gz}"
PKG_NAME="midjourney-task-management-20260609035002"
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
ROUTES="$SRC/backend/api-server/src/modules/generation/routes.ts"
REGISTRY="$SRC/backend/api-server/src/modules/generation/adapters/registry.ts"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -f "$ROUTES" || { echo "部署包缺少 routes.ts" >&2; exit 1; }
test -f "$REGISTRY" || { echo "部署包缺少 registry.ts" >&2; exit 1; }

grep -q "mj-task-bar" "$HTML" || { echo "画布缺少 MJ 任务条标记" >&2; exit 2; }
grep -q "openMidjourneyTaskPicker" "$HTML" || { echo "画布缺少 MJ 图片式任务选择器" >&2; exit 2; }
grep -q "requestMidjourneyTaskManagement" "$HTML" || { echo "画布缺少 MJ 任务管理请求逻辑" >&2; exit 2; }
grep -q "renderAssetMidjourneyTaskPanel" "$HTML" || { echo "画布缺少资产详情 MJ 任务面板" >&2; exit 2; }

grep -q "/tasks/:id/mj/fetch" "$ROUTES" || { echo "后台缺少 MJ fetch 路由" >&2; exit 2; }
grep -q "/tasks/:id/mj/seed" "$ROUTES" || { echo "后台缺少 MJ seed 路由" >&2; exit 2; }
grep -q "/tasks/:id/mj/cancel" "$ROUTES" || { echo "后台缺少 MJ cancel 路由" >&2; exit 2; }
grep -q "manageMidjourneyTaskForPrincipal" "$ROUTES" || { echo "后台缺少 MJ 任务管理逻辑" >&2; exit 2; }
grep -q "MIDJOURNEY_SPECIAL_ENDPOINTS" "$REGISTRY" || { echo "后台 registry 缺少 MJ 特殊 endpoint 表" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web" "$BACKUP/api-server/src/modules/generation/adapters" "$BACKUP/api-server/src/modules/generation"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$API_DIR/src/modules/generation/routes.ts" "$BACKUP/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$API_DIR/src/modules/generation/adapters/registry.ts" "$BACKUP/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true

log "install backend routes.ts"
run_sudo mkdir -p "$API_DIR/src/modules/generation"
run_sudo cp -f "$ROUTES" "$API_DIR/src/modules/generation/routes.ts"

log "install backend registry.ts"
run_sudo mkdir -p "$API_DIR/src/modules/generation/adapters"
run_sudo cp -f "$REGISTRY" "$API_DIR/src/modules/generation/adapters/registry.ts"
if id "$PM2_USER" >/dev/null 2>&1; then
  run_sudo chown "$PM2_USER:$PM2_USER" "$API_DIR/src/modules/generation/routes.ts" "$API_DIR/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
fi
run_sudo chmod 644 "$API_DIR/src/modules/generation/routes.ts" "$API_DIR/src/modules/generation/adapters/registry.ts" 2>/dev/null || true

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
  run_sudo chown -R "$PM2_USER:$PM2_USER" "$API_DIR/dist" "$API_DIR/src/modules/generation" 2>/dev/null || true
fi
run_as_pm2_user "cd '$API_DIR' && npm run build"

log "verify installed markers"
grep -n "mj-task-bar" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "openMidjourneyTaskPicker" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "/tasks/:id/mj/fetch" "$API_DIR/src/modules/generation/routes.ts"
grep -n "manageMidjourneyTaskForPrincipal" "$API_DIR/src/modules/generation/routes.ts"
grep -n "manageMidjourneyTaskForPrincipal" "$API_DIR/dist/modules/generation/routes.js"

log "restart api"
if command -v pm2 >/dev/null 2>&1 || run_as_pm2_user "command -v pm2 >/dev/null 2>&1"; then
  run_as_pm2_user "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  echo "WARN: 未找到 pm2，请手动重启后台服务" >&2
fi

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
