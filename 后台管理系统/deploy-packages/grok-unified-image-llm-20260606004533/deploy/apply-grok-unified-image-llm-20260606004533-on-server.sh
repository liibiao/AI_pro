#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-unified-image-llm-20260606004533"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_TARGET="${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
CLIPROXY_XAI_BASE_URL="${CLIPROXY_XAI_BASE_URL:-http://45.77.211.38:8317/v1}"
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
run_sudo test -d "$APP_DIR/admin-web" || fail "admin-web not found: $APP_DIR/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

API_SRC_ROOT="$SRC_ROOT/ai-admin-platform/api-server/src"
API_DIST_ROOT="$SRC_ROOT/ai-admin-platform/api-server/dist"
API_PKG="$SRC_ROOT/ai-admin-platform/api-server/package.json"
ADMIN_SRC="$SRC_ROOT/ai-admin-platform/admin-web/src/main.tsx"
ADMIN_DIST="$SRC_ROOT/ai-admin-platform/admin-web/dist"
WORKBENCH_SRC="$SRC_ROOT/workbench-web"
TOOLS_WORKBENCH_SRC="$SRC_ROOT/tools/workbench-web"

API_SOURCE_FILES=(
  "modules/generation/adapters/registry.ts"
  "modules/generation/routes.ts"
  "modules/models/routes.ts"
  "modules/workbench-compat/routes.ts"
  "sync-canvas-models.ts"
  "apply-grok-media-channel.ts"
)
API_DIST_FILES=(
  "modules/generation/adapters/registry.js"
  "modules/generation/routes.js"
  "modules/models/routes.js"
  "modules/workbench-compat/routes.js"
  "sync-canvas-models.js"
  "apply-grok-media-channel.js"
)
WORKBENCH_FILES=(
  "image-studio-canvas-next.html"
  "canvas-next/app.js"
  "canvas-next/generation-service.js"
  "canvas-next/renderers.js"
  "canvas-next/node-defs.js"
  "canvas-next/generator-adapters.js"
  "models/grok-image.json"
  "models/grok-image-edit.json"
  "models/grok-video.json"
  "models/grok-llm.json"
)

for rel in "${API_SOURCE_FILES[@]}"; do
  [ -f "$API_SRC_ROOT/$rel" ] || fail "package missing api source: $rel"
done
for rel in "${API_DIST_FILES[@]}"; do
  [ -f "$API_DIST_ROOT/$rel" ] || fail "package missing api dist: $rel"
done
[ -f "$API_PKG" ] || fail "package missing api-server/package.json"
[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"
for rel in "${WORKBENCH_FILES[@]}"; do
  [ -f "$WORKBENCH_SRC/$rel" ] || fail "package missing workbench file: $rel"
  [ -f "$TOOLS_WORKBENCH_SRC/$rel" ] || fail "package missing tools workbench file: $rel"
done

log "verify package markers"
grep -Fq "'grok_image': { submit: submitGrokUnifiedImage" "$API_SRC_ROOT/modules/generation/adapters/registry.ts"
grep -Fq "submitGrokUnifiedImage" "$API_DIST_ROOT/modules/generation/adapters/registry.js"
grep -Fq "grok_image" "$API_SRC_ROOT/modules/generation/routes.ts"
grep -Fq "cliproxy-grok-llm" "$API_SRC_ROOT/apply-grok-media-channel.ts"
grep -Fq "disableSupersededGrokModels" "$API_DIST_ROOT/apply-grok-media-channel.js"
grep -Fq "Grok 生图统一 自动文生图/图生图" "$ADMIN_SRC"
grep -Rqs "Grok 生图统一" "$ADMIN_DIST"
grep -Fq "grok:media:apply" "$API_PKG"
grep -Fq '"adapter": "grok_image"' "$WORKBENCH_SRC/models/grok-image.json"
grep -Fq '"status": "DISABLED"' "$WORKBENCH_SRC/models/grok-image-edit.json"
grep -Fq '"adapter": "grok-llm"' "$WORKBENCH_SRC/models/grok-llm.json"
grep -Fq "imageRatioFieldValue" "$WORKBENCH_SRC/image-studio-canvas-next.html"
grep -Fq "imageRequestGeometry" "$WORKBENCH_SRC/canvas-next/generation-service.js"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/workbench-web/public" \
  "$BACKUP_DIR/workbench-web/mirror"

for rel in "${API_SOURCE_FILES[@]}"; do
  if run_sudo test -f "$APP_DIR/api-server/src/$rel"; then
    run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/api-server/src/$(dirname "$rel")"
    run_sudo cp -a "$APP_DIR/api-server/src/$rel" "$BACKUP_DIR/ai-admin-platform/api-server/src/$rel"
  fi
done
for rel in "${API_DIST_FILES[@]}"; do
  if run_sudo test -f "$APP_DIR/api-server/dist/$rel"; then
    run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/api-server/dist/$(dirname "$rel")"
    run_sudo cp -a "$APP_DIR/api-server/dist/$rel" "$BACKUP_DIR/ai-admin-platform/api-server/dist/$rel"
  fi
done
run_sudo cp -a "$APP_DIR/api-server/package.json" "$BACKUP_DIR/ai-admin-platform/api-server/package.json" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

install_api_dist(){
  for rel in "${API_DIST_FILES[@]}"; do
    run_sudo mkdir -p "$APP_DIR/api-server/dist/$(dirname "$rel")"
    run_sudo install -m 0644 "$API_DIST_ROOT/$rel" "$APP_DIR/api-server/dist/$rel"
  done
}

log "install api-server files"
for rel in "${API_SOURCE_FILES[@]}"; do
  run_sudo mkdir -p "$APP_DIR/api-server/src/$(dirname "$rel")"
  run_sudo install -m 0644 "$API_SRC_ROOT/$rel" "$APP_DIR/api-server/src/$rel"
done
install_api_dist
run_sudo install -m 0644 "$API_PKG" "$APP_DIR/api-server/package.json"

log "install admin-web files"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist"
run_sudo install -m 0644 "$ADMIN_SRC" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist"
run_sudo mkdir -p "$APP_DIR/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"

backup_workbench_file(){
  local dest="$1"
  local label="$2"
  [ -f "$dest" ] || return 0
  local rel_path="${dest#/}"
  local backup_dir="$BACKUP_DIR/workbench-web/$label/$(dirname "$rel_path")"
  run_sudo mkdir -p "$backup_dir"
  run_sudo cp -a "$dest" "$backup_dir/"
}

install_workbench_into(){
  local src_root="$1"
  local dest_root="$2"
  local label="$3"
  run_sudo test -d "$dest_root" || return 1
  log "install workbench $label: $dest_root"
  for rel in "${WORKBENCH_FILES[@]}"; do
    run_sudo mkdir -p "$dest_root/$(dirname "$rel")"
    backup_workbench_file "$dest_root/$rel" "$label"
    run_sudo install -m 0644 "$src_root/$rel" "$dest_root/$rel"
  done
  run_sudo grep -Fq "imageRatioFieldValue" "$dest_root/image-studio-canvas-next.html"
  run_sudo grep -Fq "imageRequestGeometry" "$dest_root/canvas-next/generation-service.js"
  run_sudo grep -Fq '"adapter": "grok_image"' "$dest_root/models/grok-image.json"
  run_sudo grep -Fq '"adapter": "grok-llm"' "$dest_root/models/grok-llm.json"
  return 0
}

installed_workbench=0
if install_workbench_into "$WORKBENCH_SRC" "$WORKBENCH_DIR" "public"; then
  installed_workbench=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi
MIRROR_WORKBENCH_DIR="$MIRROR_TARGET/tools/workbench-web"
if install_workbench_into "$TOOLS_WORKBENCH_SRC" "$MIRROR_WORKBENCH_DIR" "mirror"; then
  installed_workbench=1
else
  log "mirror workbench skipped, not found: $MIRROR_WORKBENCH_DIR"
fi
[ "$installed_workbench" -eq 1 ] || fail "no workbench target found"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; keeping packaged dist"
    install_api_dist
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "build admin-web if toolchain is available"
if run_sudo bash -lc "cd '$APP_DIR/admin-web' && command -v npm >/dev/null 2>&1"; then
  if run_sudo bash -lc "cd '$APP_DIR/admin-web' && npm run build"; then
    log "admin-web build: ok"
  else
    log "admin-web npm build failed; restoring packaged dist"
    run_sudo rm -rf "$APP_DIR/admin-web/dist"
    run_sudo mkdir -p "$APP_DIR/admin-web/dist"
    run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
  fi
elif run_sudo bash -lc "cd '$APP_DIR/admin-web' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ] && [ -f node_modules/vite/bin/vite.js ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/admin-web' && node node_modules/typescript/bin/tsc -p tsconfig.json && node node_modules/vite/bin/vite.js build"; then
    log "admin-web build: ok"
  else
    log "admin-web node build failed; restoring packaged dist"
    run_sudo rm -rf "$APP_DIR/admin-web/dist"
    run_sudo mkdir -p "$APP_DIR/admin-web/dist"
    run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
  fi
else
  log "admin-web build toolchain not found; using packaged dist"
fi

log "apply Grok image/video/LLM database channel"
read_first_cliproxy_api_key(){
  local file="$1"
  run_sudo test -f "$file" || return 0
  run_sudo awk '
    /^api-keys:[[:space:]]*\[/ {
      line=$0
      sub(/^api-keys:[[:space:]]*\[/, "", line)
      sub(/\].*$/, "", line)
      split(line, parts, ",")
      key=parts[1]
      gsub(/^[[:space:]'\''"]+|[[:space:]'\''"]+$/, "", key)
      if (key != "") { print key; exit }
    }
    /^api-keys:[[:space:]]*$/ { in_keys=1; next }
    in_keys && /^[^[:space:]-]/ { in_keys=0 }
    in_keys && /^[[:space:]]*-[[:space:]]*/ {
      key=$0
      sub(/^[[:space:]]*-[[:space:]]*/, "", key)
      gsub(/^[[:space:]'\''"]+|[[:space:]'\''"]+$/, "", key)
      if (key != "") { print key; exit }
    }
  ' "$file" 2>/dev/null | head -1
}

DETECTED_CLIPROXY_XAI_API_KEY="${CLIPROXY_XAI_API_KEY:-}"
if [ -z "$DETECTED_CLIPROXY_XAI_API_KEY" ]; then
  for cfg in /opt/cliproxy/config.yaml /CLIProxyAPI/config.yaml /root/CLIProxyAPI/config.yaml "$APP_DIR/../cliproxy/config.yaml"; do
    DETECTED_CLIPROXY_XAI_API_KEY="$(read_first_cliproxy_api_key "$cfg" || true)"
    [ -n "$DETECTED_CLIPROXY_XAI_API_KEY" ] && break
  done
fi

if [ -n "$DETECTED_CLIPROXY_XAI_API_KEY" ]; then
  run_sudo env CLIPROXY_XAI_BASE_URL="$CLIPROXY_XAI_BASE_URL" CLIPROXY_XAI_API_KEY="$DETECTED_CLIPROXY_XAI_API_KEY" bash -lc "cd '$APP_DIR/api-server' && node dist/apply-grok-media-channel.js"
elif run_sudo bash -lc "cd '$APP_DIR/api-server' && [ -f .env ] && grep -q '^CLIPROXY_XAI_API_KEY=' .env"; then
  run_sudo env CLIPROXY_XAI_BASE_URL="$CLIPROXY_XAI_BASE_URL" bash -lc "cd '$APP_DIR/api-server' && set -a && . ./.env && set +a && node dist/apply-grok-media-channel.js"
else
  log "CLIPROXY_XAI_API_KEY not set; skipped DB channel apply. Run it later with CLIPROXY_XAI_API_KEY."
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "'grok_image': { submit: submitGrokUnifiedImage" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "submitGrokUnifiedImage" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "cliproxy-grok-llm" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
run_sudo grep -Fq "grok_image" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "Grok 生图统一 自动文生图/图生图" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Rqs "Grok 生图统一" "$APP_DIR/admin-web/dist"
if run_sudo test -d "$WORKBENCH_DIR"; then
  run_sudo grep -Fq "imageRatioFieldValue" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "imageRequestGeometry" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
echo "canvas refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$PKG"
