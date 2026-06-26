#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-video-normal10-fix-20260606131829"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || fail "package root not found: $SRC_ROOT"

REGISTRY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
MODELS_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts"
MODELS_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js"
GROK_APPLY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/apply-grok-media-channel.ts"
GROK_APPLY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/apply-grok-media-channel.js"
CANVAS_PUBLIC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
CANVAS_MIRROR="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"

[ -f "$REGISTRY_SRC" ] || fail "package missing registry.ts"
[ -f "$REGISTRY_DIST" ] || fail "package missing registry.js"
[ -f "$MODELS_SRC" ] || fail "package missing models routes.ts"
[ -f "$MODELS_DIST" ] || fail "package missing models routes.js"
[ -f "$GROK_APPLY_SRC" ] || fail "package missing apply-grok-media-channel.ts"
[ -f "$GROK_APPLY_DIST" ] || fail "package missing apply-grok-media-channel.js"
[ -f "$CANVAS_PUBLIC" ] || fail "package missing public canvas html"
[ -f "$CANVAS_MIRROR" ] || fail "package missing mirror canvas html"

log "verify package markers"
grep -Fq "grokVideoDefaultDurations" "$REGISTRY_SRC"
grep -Fq "const maxSeconds = key.includes('grok-imagine-video-1.5-preview')" "$REGISTRY_SRC"
grep -Fq "maxImages: { full: 7" "$MODELS_SRC"
grep -Fq "defaultVideoMaxDurationSeconds" "$GROK_APPLY_SRC"
grep -Fq "process.env.CLIPROXY_XAI_VIDEO_MODEL || 'grok-imagine-video'" "$GROK_APPLY_SRC"
grep -Fq "const GROK_VIDEO_DURATIONS=Array.from({length:10}" "$CANVAS_PUBLIC"
grep -Fq "grokVideoDurationOptions" "$CANVAS_PUBLIC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web"

backup_file(){
  local src="$1" dest="$2"
  if run_sudo test -f "$src"; then
    run_sudo mkdir -p "$(dirname "$dest")"
    run_sudo cp -p "$src" "$dest"
  fi
}

backup_file "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
backup_file "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
backup_file "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts"
backup_file "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js"
backup_file "$APP_DIR/api-server/src/apply-grok-media-channel.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-grok-media-channel.ts"
backup_file "$APP_DIR/api-server/dist/apply-grok-media-channel.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-grok-media-channel.js"
backup_file "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"
backup_file "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"

log "install api-server Grok video files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/generation/adapters" \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/dist/modules/models"
run_sudo install -m 0644 "$REGISTRY_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$MODELS_SRC" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$MODELS_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo install -m 0644 "$GROK_APPLY_SRC" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo install -m 0644 "$GROK_APPLY_DIST" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"

install_canvas(){
  local src="$1" dest="$2" label="$3"
  if run_sudo test -d "$(dirname "$dest")"; then
    log "install $label: $dest"
    backup_file "$dest" "$BACKUP_DIR/${label// /_}/image-studio-canvas-next.html"
    run_sudo install -m 0644 "$src" "$dest"
    if id www-data >/dev/null 2>&1 && [ "${dest#/var/www/}" != "$dest" ]; then
      run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
    fi
    return 0
  fi
  return 1
}

installed_canvas=0
install_canvas "$CANVAS_PUBLIC" "$WORKBENCH_DIR/image-studio-canvas-next.html" "workbench-web" && installed_canvas=1 || true
install_canvas "$CANVAS_PUBLIC" "$APP_DIR/workbench-web/image-studio-canvas-next.html" "app-workbench-web" && installed_canvas=1 || true
install_canvas "$CANVAS_MIRROR" "$APP_DIR/tools/workbench-web/image-studio-canvas-next.html" "app-tools-workbench-web" && installed_canvas=1 || true
install_canvas "$CANVAS_MIRROR" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror-tools-workbench-web" && installed_canvas=1 || true
[ "$installed_canvas" -eq 1 ] || fail "no canvas target found"

log "patch cliproxy-grok-video capabilities in database"
cd "$APP_DIR/api-server"
run_sudo node --input-type=module <<'NODE'
import { prisma } from './dist/db.js';

const durations = Array.from({ length: 10 }, (_, index) => index + 1);
const modeMax = { 'text-to-video': 10, 'image-to-video': 10, 'reference-to-video': 10 };
const modeDurations = {
  'text-to-video': durations,
  'image-to-video': durations,
  'reference-to-video': durations,
};
const patch = {
  resolutions: ['480p', '720p'],
  durations,
  defaultDuration: 6,
  defaultResolution: '720p',
  aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  maxVideoDurationSeconds: 10,
  max_video_duration_seconds: 10,
  maxImageReferenceDurationSeconds: 10,
  max_image_reference_duration_seconds: 10,
  maxVideoDurationSecondsByMode: modeMax,
  max_video_duration_seconds_by_mode: modeMax,
  maxDurationByMode: modeMax,
  durationsByMode: modeDurations,
  maxImages: { full: 7, smartMultiFrame: 7, firstLast: 2 },
  supportsAudio: false,
  supportsVideo: false,
};
const supportsPatch = { txt2video: true, img2video: true, imageToVideo: true, referenceToVideo: true };
const model = await prisma.aiModel.findUnique({ where: { id: 'cliproxy-grok-video' } });
if (!model) {
  console.log('cliproxy-grok-video not found, skip database patch');
} else {
  const capabilities = model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities)
    ? model.capabilities
    : {};
  const supports = model.supports && typeof model.supports === 'object' && !Array.isArray(model.supports)
    ? model.supports
    : {};
  await prisma.aiModel.update({
    where: { id: model.id },
    data: {
      name: 'grok-imagine-video',
      capabilities: { ...capabilities, ...patch },
      supports: { ...supports, ...supportsPatch },
    },
  });
  console.log(`patched ${model.id}/${model.name} -> grok-imagine-video, maxDuration=10s, maxImages=7`);
}
await prisma.$disconnect();
NODE

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "grokVideoDefaultDurations" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "maxVideoDurationSeconds = key.includes" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "process.env.CLIPROXY_XAI_VIDEO_MODEL || 'grok-imagine-video'" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "const GROK_VIDEO_DURATIONS=Array.from({length:10}" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "const GROK_VIDEO_DURATIONS=Array.from({length:10}" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
