#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: apply-volcano-sd2-low-cost-resolution-pricing-20260623033304-on-server.sh <package.tar.gz>}"
PKG="volcano-sd2-low-cost-resolution-pricing-20260623033304"
APP_ROOT="${APP_ROOT:-/var/www/ai-admin/ai-admin-platform}"
API_SERVER="${API_SERVER:-$APP_ROOT/api-server}"
PUBLIC_WEB="${PUBLIC_WEB:-/var/www/ai-admin/workbench-web}"
REPO_ROOT="${REPO_ROOT:-/home/ubuntu/漫剧创作库}"
WORK_DIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups/${PKG}-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

backup_file() {
  local target="$1"
  [ -f "$target" ] || return 0
  local backup="$BACKUP_ROOT/${target#/}"
  mkdir -p "$(dirname "$backup")"
  cp -p "$target" "$backup"
}

install_file() {
  local src="$1"
  local dest="$2"
  local label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  cp -p "$src" "$dest"
  chmod 644 "$dest" 2>/dev/null || true
  log "installed $dest"
}

install_if_parent_exists() {
  local src="$1"
  local dest="$2"
  local label="$3"
  if [ -d "$(dirname "$dest")" ]; then
    install_file "$src" "$dest" "$label"
    INSTALLED=$((INSTALLED + 1))
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_json_marker() {
  local file="$1"
  grep -Fq '火山 SD 2.0 低价' "$file"
  grep -Fq '"resolutions": ["720p", "1080p"]' "$file"
  grep -Fq '"resolutionTiers"' "$file"
  grep -Fq '"720p": "small"' "$file"
  grep -Fq '"1080p": "large"' "$file"
}

verify_canvas_next_marker() {
  local file="$1"
  grep -Fq "isLingdongSd2VipVideoModel(model))return {durations:[15],defaultDuration:15,resolutions:['720p','1080p']" "$file"
  grep -Fq "function videoResolutionAlias(value)" "$file"
  grep -Fq "if(raw==='large')return '1080p';" "$file"
}

verify_legacy_canvas_marker() {
  local file="$1"
  grep -Fq "function videoResolutionAlias(value)" "$file"
  grep -Fq "if(raw==='large')return '1080p';" "$file"
}

verify_modular_marker() {
  local file="$1"
  grep -Fq "function videoResolutionAlias(value)" "$file"
  grep -Fq "const requestedResolution=videoResolutionAlias(values.resolution);" "$file"
}

verify_backend_marker() {
  local file="$1"
  grep -Fq "def _lingdong_sd2_vip_resolution(value: Any) -> str:" "$file"
  grep -Fq 'return "1080p"' "$file"
}

restart_pm2_if_exists() {
  local name="$1"
  if command -v sudo >/dev/null 2>&1 && id ubuntu >/dev/null 2>&1; then
    sudo -u ubuntu -H bash -lc "pm2 show '$name' >/dev/null 2>&1 && pm2 restart '$name' --update-env >/dev/null" && {
      log "restarted pm2: $name"
      return 0
    }
  fi
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env >/dev/null
    log "restarted pm2: $name"
    return 0
  fi
  return 1
}

[ -f "$ARCHIVE_PATH" ] || fail "archive not found: $ARCHIVE_PATH"
[ -d "$API_SERVER/dist" ] || fail "api server dist not found: $API_SERVER/dist"

log "extract $ARCHIVE_PATH"
tar --no-same-owner -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_json_marker "$SRC/workbench-web/models/lingdong-sd-2-vip.json"
verify_json_marker "$SRC/tools/workbench-web/models/lingdong-sd-2-vip.json"
verify_json_marker "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/lingdong-sd-2-vip.json"
verify_canvas_next_marker "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_next_marker "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_legacy_canvas_marker "$SRC/workbench-web/image-studio-canvas.html"
verify_legacy_canvas_marker "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_legacy_canvas_marker "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_modular_marker "$SRC/workbench-web/canvas-next/renderers.js"
verify_modular_marker "$SRC/workbench-web/canvas-next/generation-service.js"
verify_modular_marker "$SRC/tools/workbench-web/canvas-next/renderers.js"
verify_modular_marker "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_modular_marker "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
verify_modular_marker "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_backend_marker "$SRC/tools/image_studio_backend.py"
verify_backend_marker "$SRC/smart-vision/services/workbench/image_studio_backend.py"

mkdir -p "$BACKUP_ROOT"
log "backup dir: $BACKUP_ROOT"

INSTALLED=0
if [ -d "$PUBLIC_WEB" ]; then
  install_file "$SRC/workbench-web/models/lingdong-sd-2-vip.json" "$PUBLIC_WEB/models/lingdong-sd-2-vip.json" "public model json"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_WEB/image-studio-canvas-next.html" "public canvas next html"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$PUBLIC_WEB/image-studio-canvas.html" "public canvas html"
  install_file "$SRC/workbench-web/canvas-next/renderers.js" "$PUBLIC_WEB/canvas-next/renderers.js" "public renderers"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$PUBLIC_WEB/canvas-next/generation-service.js" "public generation service"
  INSTALLED=$((INSTALLED + 1))
else
  log "public workbench skipped, not found: $PUBLIC_WEB"
fi

install_if_parent_exists "$SRC/tools/workbench-web/models/lingdong-sd-2-vip.json" "$REPO_ROOT/tools/workbench-web/models/lingdong-sd-2-vip.json" "mirror model json"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next html"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$REPO_ROOT/tools/workbench-web/image-studio-canvas.html" "mirror canvas html"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/renderers.js" "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" "mirror renderers"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$REPO_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$REPO_ROOT/tools/image_studio_backend.py" "mirror backend"

install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/lingdong-sd-2-vip.json" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/lingdong-sd-2-vip.json" "smart legacy model json"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas html"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "smart legacy renderers"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "smart legacy generation service"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$REPO_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart backend"

RUNTIME_ROOT="$REPO_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/models/lingdong-sd-2-vip.json" "$RUNTIME_ROOT/tools/workbench-web/models/lingdong-sd-2-vip.json" "runtime model json"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next html"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas html"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/renderers.js" "runtime renderers"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime backend"
fi

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "install and run admin migration"
install -m 755 -D "$SRC/api-server/scripts/apply-volcano-sd2-low-cost-resolution-pricing.mjs" "$API_SERVER/scripts/apply-volcano-sd2-low-cost-resolution-pricing.mjs"
(cd "$API_SERVER" && CANVAS_MODEL_CONFIG="$PUBLIC_WEB/models/lingdong-sd-2-vip.json" node scripts/apply-volcano-sd2-low-cost-resolution-pricing.mjs)

log "verify installed markers"
if [ -f "$PUBLIC_WEB/models/lingdong-sd-2-vip.json" ]; then
  verify_json_marker "$PUBLIC_WEB/models/lingdong-sd-2-vip.json"
fi
if [ -f "$PUBLIC_WEB/image-studio-canvas-next.html" ]; then
  verify_canvas_next_marker "$PUBLIC_WEB/image-studio-canvas-next.html"
fi
if [ -f "$REPO_ROOT/smart-vision/services/workbench/image_studio_backend.py" ]; then
  verify_backend_marker "$REPO_ROOT/smart-vision/services/workbench/image_studio_backend.py"
fi

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$REPO_ROOT/tools/image_studio_backend.py" ] && PY_FILES+=("$REPO_ROOT/tools/image_studio_backend.py")
  [ -f "$REPO_ROOT/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$REPO_ROOT/smart-vision/services/workbench/image_studio_backend.py")
  [ "${#PY_FILES[@]}" -eq 0 ] || python3 -m py_compile "${PY_FILES[@]}" >/dev/null
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
  if restart_pm2_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; no known process found"
fi

log "done"
echo "backup: $BACKUP_ROOT"
