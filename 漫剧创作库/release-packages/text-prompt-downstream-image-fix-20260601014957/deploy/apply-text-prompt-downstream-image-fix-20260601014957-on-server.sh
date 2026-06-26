#!/usr/bin/env bash
set -euo pipefail

PKG="text-prompt-downstream-image-fix-20260601014957"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi
if [ ! -d "$TARGET/tools/workbench-web" ]; then
  echo "target workbench not found: $TARGET/tools/workbench-web" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

SRC_CANVAS="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
DEST_CANVAS="$TARGET/tools/workbench-web/image-studio-canvas-next.html"
SRC_API_DIST="$TMP_DIR/$PKG/api-server/dist/modules/workbench/text-agent-routes.js"
SRC_API_TS="$TMP_DIR/$PKG/api-server/src/modules/workbench/text-agent-routes.ts"

if [ ! -f "$SRC_CANVAS" ]; then
  echo "package file missing: $SRC_CANVAS" >&2
  exit 1
fi
if [ ! -f "$SRC_API_DIST" ]; then
  echo "package file missing: $SRC_API_DIST" >&2
  exit 1
fi

find_api_dir(){
  if [ -n "${API_DIR:-}" ] && [ -f "$API_DIR/dist/modules/workbench/text-agent-routes.js" ]; then
    printf '%s' "$API_DIR"
    return 0
  fi
  if command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    local pm2_cwd
    pm2_cwd="$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);const p=a.find(x=>x.name==='ai-admin-api');process.stdout.write(p?.pm2_env?.pm_cwd||'')}catch(e){}})" || true)"
    if [ -n "$pm2_cwd" ] && [ -f "$pm2_cwd/dist/modules/workbench/text-agent-routes.js" ]; then
      printf '%s' "$pm2_cwd"
      return 0
    fi
  fi
  local candidates=(
    "$TARGET/api-server"
    "$TARGET/../后台管理系统/api-server"
    "/home/ubuntu/后台管理系统/api-server"
    "/home/ubuntu/AI_pro/后台管理系统/api-server"
    "/opt/后台管理系统/api-server"
    "/var/www/后台管理系统/api-server"
  )
  local dir
  for dir in "${candidates[@]}"; do
    if [ -f "$dir/dist/modules/workbench/text-agent-routes.js" ]; then
      printf '%s' "$dir"
      return 0
    fi
  done
  return 1
}

API_TARGET_DIR="$(find_api_dir || true)"
if [ -z "$API_TARGET_DIR" ]; then
  echo "ai-admin-api directory not found. Set API_DIR=/path/to/api-server and rerun this deploy script." >&2
  exit 1
fi

log "backup current files"
mkdir -p "$BACKUP_DIR/tools/workbench-web" "$BACKUP_DIR/api-server/dist/modules/workbench" "$BACKUP_DIR/api-server/src/modules/workbench"
cp -p "$DEST_CANVAS" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"
cp -p "$API_TARGET_DIR/dist/modules/workbench/text-agent-routes.js" "$BACKUP_DIR/api-server/dist/modules/workbench/text-agent-routes.js"
if [ -f "$API_TARGET_DIR/src/modules/workbench/text-agent-routes.ts" ]; then
  cp -p "$API_TARGET_DIR/src/modules/workbench/text-agent-routes.ts" "$BACKUP_DIR/api-server/src/modules/workbench/text-agent-routes.ts"
fi

log "install canvas fix"
install -m 0644 "$SRC_CANVAS" "$DEST_CANVAS"

log "install text agent backend fix: $API_TARGET_DIR"
install -m 0644 "$SRC_API_DIST" "$API_TARGET_DIR/dist/modules/workbench/text-agent-routes.js"
if [ -f "$API_TARGET_DIR/src/modules/workbench/text-agent-routes.ts" ]; then
  install -m 0644 "$SRC_API_TS" "$API_TARGET_DIR/src/modules/workbench/text-agent-routes.ts"
fi

log "verify markers"
grep -q "normalizeTextPromptForDownstream" "$DEST_CANVAS"
grep -q "negativePrompt:taskNegativePrompt" "$DEST_CANVAS"
grep -q "params.negativePrompt=negative" "$DEST_CANVAS"
grep -q "buildUserMessageContent" "$API_TARGET_DIR/dist/modules/workbench/text-agent-routes.js"
grep -q "image_url" "$API_TARGET_DIR/dist/modules/workbench/text-agent-routes.js"
grep -q "normalizeTextAgentMediaUrls" "$API_TARGET_DIR/dist/modules/workbench/text-agent-routes.js"
if grep -q "startRect" "$DEST_CANVAS"; then
  echo "canvas-next still contains stale startRect reference" >&2
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 jlist 2>/dev/null | grep -q '"name":"ai-admin-api"'; then
    log "restart ai-admin-api"
    pm2 restart ai-admin-api --update-env
  else
    log "pm2 ai-admin-api not found; backend file installed but service was not restarted"
  fi
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
