#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aistartlab-model-resolution-template-20260626004423"
ARCHIVE="${1:?usage: apply-aistartlab-model-resolution-template-20260626004423-on-server.sh <archive.tar.gz>}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
API_ROOT="${API_ROOT:-$REMOTE_ROOT/ai-admin-platform/api-server}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}

pm2_run(){
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
}

backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local backup="$BACKUP_DIR/${dest#/}"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  case "$dest" in
    "$API_ROOT"/*)
      if id ubuntu >/dev/null 2>&1; then run_sudo chown ubuntu:ubuntu "$dest" 2>/dev/null || true; fi
      ;;
    /var/www/*)
      if id www-data >/dev/null 2>&1; then run_sudo chown www-data:www-data "$dest" 2>/dev/null || true; fi
      ;;
  esac
  log "installed $dest"
}

install_if_parent_exists(){
  local src="$1" dest="$2" label="$3"
  if run_sudo test -d "$(dirname "$dest")"; then
    install_file "$src" "$dest" "$label"
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_registry_marker(){
  local file="$1"
  grep -Fq "assembleAistartLabModelName" "$file"
  grep -Fq "normalizeAistartLabModelResolution" "$file"
  grep -Fq "model: resolveAistartLabModel(ctx, resolution)" "$file" || grep -Fq "const model = resolveAistartLabModel(ctx, resolution)" "$file"
}

verify_model_json(){
  local file="$1"
  grep -Fq '"model": "seedance-2.0"' "$file"
  grep -Fq '"resolutions": ["480p", "720p", "1080p"]' "$file"
  grep -Fq '"type": "template"' "$file"
  grep -Fq '"template": "{model}-{resolution}"' "$file"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_ROOT" || fail "api root not found: $API_ROOT"
command -v node >/dev/null 2>&1 || fail "node not found on remote"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_registry_marker "$SRC/payload/api-server/src/modules/generation/adapters/registry.ts"
verify_registry_marker "$SRC/payload/api-server/dist/modules/generation/adapters/registry.js"
verify_model_json "$SRC/workbench-web/models/aistartlab-video-test.json"
verify_model_json "$SRC/tools/workbench-web/models/aistartlab-video-test.json"
verify_model_json "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json"
verify_model_json "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/models/aistartlab-video-test.json"
grep -Fq "BASE_MODEL = 'seedance-2.0'" "$SRC/api-server/scripts/apply-aistartlab-model-resolution-template.mjs"
grep -Fq "MODEL_TEMPLATE = '{model}-{resolution}'" "$SRC/api-server/scripts/apply-aistartlab-model-resolution-template.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api adapter"
install_file "$SRC/payload/api-server/src/modules/generation/adapters/registry.ts" "$API_ROOT/src/modules/generation/adapters/registry.ts" "api source adapter registry"
install_file "$SRC/payload/api-server/dist/modules/generation/adapters/registry.js" "$API_ROOT/dist/modules/generation/adapters/registry.js" "api dist adapter registry"
node --check "$API_ROOT/dist/modules/generation/adapters/registry.js" >/dev/null

log "install AIStartLab static model config"
install_if_parent_exists "$SRC/workbench-web/models/aistartlab-video-test.json" "$WORKBENCH_DIR/models/aistartlab-video-test.json" "public AIStartLab model"
install_if_parent_exists "$SRC/tools/workbench-web/models/aistartlab-video-test.json" "$MIRROR_ROOT/tools/workbench-web/models/aistartlab-video-test.json" "mirror AIStartLab model"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aistartlab-video-test.json" "smart legacy AIStartLab model"
install_if_parent_exists "$SRC/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web/models/aistartlab-video-test.json" "$RUNTIME_ROOT/tools/workbench-web/models/aistartlab-video-test.json" "runtime AIStartLab model"

log "install and run admin DB update"
install_file "$SRC/api-server/scripts/apply-aistartlab-model-resolution-template.mjs" "$API_ROOT/scripts/apply-aistartlab-model-resolution-template.mjs" "admin DB update script"
(cd "$API_ROOT" && AISTARTLAB_MODEL_JSON="$WORKBENCH_DIR/models/aistartlab-video-test.json" node scripts/apply-aistartlab-model-resolution-template.mjs)

log "verify installed markers and DB rows"
verify_registry_marker "$API_ROOT/src/modules/generation/adapters/registry.ts"
verify_registry_marker "$API_ROOT/dist/modules/generation/adapters/registry.js"
if run_sudo test -f "$WORKBENCH_DIR/models/aistartlab-video-test.json"; then verify_model_json "$WORKBENCH_DIR/models/aistartlab-video-test.json"; fi
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const model = await prisma.aiModel.findFirst({
  where: { modelKey: 'aistartlab-video-test' },
  include: { provider: true },
});
if (!model) throw new Error('missing aistartlab model');
if (model.name !== 'seedance-2.0') throw new Error(`model.name=${model.name}`);
if (model.protocol?.model !== 'seedance-2.0') throw new Error(`protocol.model=${model.protocol?.model}`);
if (model.modelAssembly?.type !== 'template') throw new Error(`modelAssembly.type=${model.modelAssembly?.type}`);
if (model.modelAssembly?.template !== '{model}-{resolution}') throw new Error(`modelAssembly.template=${model.modelAssembly?.template}`);
for (const resolution of ['480p', '720p', '1080p']) {
  if (!model.capabilities?.resolutions?.includes(resolution)) throw new Error(`missing resolution ${resolution}`);
}
if (model.provider?.providerKey !== 'aistartlab-video') throw new Error(`provider=${model.provider?.providerKey}`);
console.log(`[verify] model=${model.id} name=${model.name} template=${model.modelAssembly.template} resolutions=${model.capabilities.resolutions.join(',')}`);
await prisma.$disconnect();
NODE
)

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped, app not found: $PM2_APP"
fi

log "done: $PKG"
echo "backup: $BACKUP_DIR"
