#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance2-artifex-720-model-map-fix-20260613010931"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}
pm2_run(){
  if [ "$(id -un 2>/dev/null || true)" = "$PM2_USER" ] && command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  else
    return 127
  fi
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

verify_registry(){
  local file="$1"
  grep -Fq "providerKey === 'artifex-seedance2' && /^seedance-2$/i.test(sdModel)" "$file"
  grep -Fq "return 'video-pro-720p';" "$file"
  grep -Fq "providerKey === 'artifex-seedance2-fast' && /^seedance-2-fast$/i.test(sdModel)" "$file"
  grep -Fq "return 'video-fast-720p';" "$file"
  grep -Fq "usesArtifexSeedance2Channel" "$file"
}
verify_apply_script(){
  local file="$1"
  grep -Fq "model: 'video-fast-720p'" "$file"
  grep -Fq "model: 'video-pro-720p'" "$file"
}
verify_model_json(){
  local file="$1" model="$2"
  grep -Fq "\"model\": \"$model\"" "$file"
  grep -Fq "\"name\": \"$model\"" "$file"
}
verify_registry_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_registry); verify_registry \"\$0\"" "$file"
}
verify_model_json_sudo(){
  local file="$1" model="$2"
  run_sudo bash -c "$(declare -f verify_model_json); verify_model_json \"\$0\" \"\$1\"" "$file" "$model"
}
install_file(){
  local rel="$1" dest="$2"
  [ -f "$SRC/$rel" ] || fail "$rel missing in package"
  run_sudo mkdir -p "$(dirname "$dest")"
  if run_sudo test -f "$dest"; then
    local backup="$BACKUP_DIR/$rel"
    run_sudo mkdir -p "$(dirname "$backup")"
    run_sudo cp -p "$dest" "$backup"
  fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest" 2>/dev/null || true
  log "installed $dest"
}
install_if_dir(){
  local rel="$1" dest="$2"
  if run_sudo test -d "$(dirname "$dest")"; then
    install_file "$rel" "$dest"
  else
    log "skipped, dir not found: $(dirname "$dest")"
  fi
}

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_registry "$SRC/api-server/src/modules/generation/adapters/registry.ts"
verify_registry "$SRC/api-server/dist/modules/generation/adapters/registry.js"
verify_apply_script "$SRC/api-server/src/apply-artifex-seedance2-channels.ts"
verify_apply_script "$SRC/api-server/dist/apply-artifex-seedance2-channels.js"
verify_model_json "$SRC/workbench-web/models/seedance2-fast.json" "video-fast-720p"
verify_model_json "$SRC/workbench-web/models/seedance2-pro.json" "video-pro-720p"

log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/src/apply-artifex-seedance2-channels.ts" "$APP_DIR/api-server/src/apply-artifex-seedance2-channels.ts"
install_file "api-server/dist/apply-artifex-seedance2-channels.js" "$APP_DIR/api-server/dist/apply-artifex-seedance2-channels.js"

install_if_dir "workbench-web/models/seedance2-fast.json" "$WORKBENCH_DIR/models/seedance2-fast.json"
install_if_dir "workbench-web/models/seedance2-pro.json" "$WORKBENCH_DIR/models/seedance2-pro.json"
install_if_dir "tools/workbench-web/models/seedance2-fast.json" "$MIRROR_TARGET/tools/workbench-web/models/seedance2-fast.json"
install_if_dir "tools/workbench-web/models/seedance2-pro.json" "$MIRROR_TARGET/tools/workbench-web/models/seedance2-pro.json"
install_if_dir "smart-vision/canvas/legacy-workbench/workbench-web/models/seedance2-fast.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance2-fast.json"
install_if_dir "smart-vision/canvas/legacy-workbench/workbench-web/models/seedance2-pro.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance2-pro.json"

log "repair db model names"
cd "$APP_DIR/api-server"
node -r dotenv/config <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const targets = [
  { providerKey: 'artifex-seedance2-fast', modelId: 'canvas-seedance2-fast', upstreamModel: 'video-fast-720p' },
  { providerKey: 'artifex-seedance2', modelId: 'canvas-seedance2-pro', upstreamModel: 'video-pro-720p' },
];
(async () => {
  for (const target of targets) {
    const provider = await prisma.upstreamProvider.update({
      where: { providerKey: target.providerKey },
      data: { defaultModel: target.upstreamModel },
      select: { providerKey: true, defaultModel: true },
    });
    const model = await prisma.aiModel.update({
      where: { id: target.modelId },
      data: { name: target.upstreamModel },
      select: { id: true, name: true, modelKey: true },
    });
    console.log(`[repair] ${provider.providerKey} default=${provider.defaultModel}; ${model.id} name=${model.name} modelKey=${model.modelKey}`);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
NODE

log "verify installed markers"
verify_registry_sudo "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
verify_model_json_sudo "$WORKBENCH_DIR/models/seedance2-fast.json" "video-fast-720p"
verify_model_json_sudo "$WORKBENCH_DIR/models/seedance2-pro.json" "video-pro-720p"

log "restart api"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 process not found: $PM2_APP"
fi

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"
log "done"
echo "backup: $BACKUP_DIR"
