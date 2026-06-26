#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-all-node-credit-estimate-fix-20260603133537"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/${PKG}-${STAMP}"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

[ -f "$ARCHIVE" ] || fail "找不到部署包: $ARCHIVE"
[ -d "$REMOTE_API_ROOT/api-server" ] || fail "找不到 API 目录: $REMOTE_API_ROOT/api-server"
[ -d "$REMOTE_WORKBENCH_ROOT" ] || fail "找不到画布目录: $REMOTE_WORKBENCH_ROOT"

run_sudo mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web"

log "解压 $ARCHIVE"
run_sudo tar -xzf "$ARCHIVE" -C "$DEPLOY_DIR"
SRC_ROOT="$DEPLOY_DIR"
if [ -d "$DEPLOY_DIR/$PKG" ]; then
  SRC_ROOT="$DEPLOY_DIR/$PKG"
fi

src_for(){
  local rel="$1"
  [ -f "$SRC_ROOT/$rel" ] || fail "包内缺少文件: $rel"
  printf '%s\n' "$SRC_ROOT/$rel"
}

backup_one(){
  local file="$1"
  local dest="$2"
  if [ -f "$file" ]; then
    run_sudo cp -a "$file" "$dest" 2>/dev/null || true
  fi
}

install_one(){
  local rel="$1"
  local dest="$2"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  run_sudo install -m 0644 "$src" "$dest"
  log "installed $dest"
}

log "备份线上文件到 $BACKUP_DIR"
backup_one "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts"
backup_one "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js"
backup_one "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts"
backup_one "$REMOTE_API_ROOT/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js"
backup_one "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"

log "覆盖修复文件"
install_one "ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
install_one "ai-admin-platform/api-server/src/sync-canvas-models.ts" "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts"
install_one "workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  install_one "workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "编译 API"
API_DIR="$REMOTE_API_ROOT/api-server"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
else
  fail "服务器未找到 npm，无法编译 API"
fi

log "重启 $PM2_NAME"
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1 && sudo -iu "$PM2_USER" pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" pm2 restart "$PM2_NAME" --update-env
  sudo -iu "$PM2_USER" pm2 save || true
else
  log "WARN: 未找到 PM2 进程 $PM2_NAME，请手动重启后端服务"
fi

log "校验补丁"
grep -q "pricingPatchKeys" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
grep -q "preserveExistingPricing" "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts"
grep -q "function pricingObject(model)" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "function estimateVideoModelCredits" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "function estimateSingleImageProcessCredits" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "function refreshAllCreditEstimateDoms" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "data-credit-estimate" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "smartFrameMotionSeconds" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"

log "健康检查"
curl -sS http://127.0.0.1:4000/api/health || true
echo

log "部署完成。备份目录: $BACKUP_DIR"
log "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
