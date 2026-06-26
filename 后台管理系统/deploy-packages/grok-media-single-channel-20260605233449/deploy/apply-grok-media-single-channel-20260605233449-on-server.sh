#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-media-single-channel-20260605233449"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
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

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

API_SRC="$SRC_ROOT/ai-admin-platform/api-server/src"
API_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist"
API_PKG="$SRC_ROOT/ai-admin-platform/api-server/package.json"
MODEL_SRC="$SRC_ROOT/workbench-web/models"

[ -f "$API_SRC/modules/generation/adapters/registry.ts" ] || fail "package missing registry.ts"
[ -f "$API_SRC/upstream.ts" ] || fail "package missing upstream.ts"
[ -f "$API_SRC/modules/models/routes.ts" ] || fail "package missing model routes.ts"
[ -f "$API_SRC/sync-canvas-models.ts" ] || fail "package missing sync-canvas-models.ts"
[ -f "$API_SRC/apply-grok-media-channel.ts" ] || fail "package missing apply-grok-media-channel.ts"
[ -f "$API_DIST/modules/generation/adapters/registry.js" ] || fail "package missing registry.js"
[ -f "$API_DIST/upstream.js" ] || fail "package missing upstream.js"
[ -f "$API_DIST/modules/models/routes.js" ] || fail "package missing model routes.js"
[ -f "$API_DIST/sync-canvas-models.js" ] || fail "package missing sync-canvas-models.js"
[ -f "$API_DIST/apply-grok-media-channel.js" ] || fail "package missing apply-grok-media-channel.js"
[ -f "$MODEL_SRC/grok-image.json" ] || fail "package missing grok-image.json"
[ -f "$MODEL_SRC/grok-image-edit.json" ] || fail "package missing grok-image-edit.json"
[ -f "$MODEL_SRC/grok-video.json" ] || fail "package missing grok-video.json"

log "verify package markers"
grep -Fq "'grok-video': { submit: submitGrokVideo, query: queryGenericVideo }" "$API_SRC/modules/generation/adapters/registry.ts"
grep -Fq "reference_image_urls" "$API_SRC/modules/generation/adapters/registry.ts"
grep -Fq "grok-imagine-video" "$API_SRC/apply-grok-media-channel.ts"
grep -Fq "disableLegacyGrokChannels" "$API_SRC/apply-grok-media-channel.ts"
grep -Fq "grok:media:apply" "$API_PKG"
grep -Fq '"model": "grok-imagine-image"' "$MODEL_SRC/grok-image.json"
grep -Fq '"model": "grok-imagine-video"' "$MODEL_SRC/grok-video.json"
grep -Fq '"statusEndpointPath": "/videos/{taskId}"' "$MODEL_SRC/grok-video.json"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server"

for rel in \
  "src/modules/generation/adapters/registry.ts" \
  "src/upstream.ts" \
  "src/modules/models/routes.ts" \
  "src/sync-canvas-models.ts" \
  "src/apply-grok-media-channel.ts" \
  "dist/modules/generation/adapters/registry.js" \
  "dist/upstream.js" \
  "dist/modules/models/routes.js" \
  "dist/sync-canvas-models.js" \
  "dist/apply-grok-media-channel.js" \
  "package.json"; do
  if run_sudo test -f "$APP_DIR/api-server/$rel"; then
    run_sudo cp -a "$APP_DIR/api-server/$rel" "$BACKUP_DIR/ai-admin-platform/api-server/$rel"
  fi
done

log "install api-server files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/dist/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/models"
run_sudo install -m 0644 "$API_SRC/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$API_SRC/upstream.ts" "$APP_DIR/api-server/src/upstream.ts"
run_sudo install -m 0644 "$API_SRC/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$API_SRC/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts"
run_sudo install -m 0644 "$API_SRC/apply-grok-media-channel.ts" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo install -m 0644 "$API_DIST/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$API_DIST/upstream.js" "$APP_DIR/api-server/dist/upstream.js"
run_sudo install -m 0644 "$API_DIST/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo install -m 0644 "$API_DIST/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"
run_sudo install -m 0644 "$API_DIST/apply-grok-media-channel.js" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
run_sudo install -m 0644 "$API_PKG" "$APP_DIR/api-server/package.json"

install_workbench_models(){
  local installed=0
  local candidate
  for candidate in \
    "$REMOTE_ROOT/workbench-web" \
    "$APP_DIR/workbench-web" \
    "$APP_DIR/tools/workbench-web" \
    "$REMOTE_ROOT/../workbench-web" \
    "/var/www/workbench-web"; do
    if run_sudo test -d "$candidate"; then
      log "install workbench Grok model configs: $candidate/models"
      run_sudo mkdir -p "$candidate/models"
      run_sudo mkdir -p "$BACKUP_DIR/workbench-web/$(echo "$candidate" | sed 's#[/:]#_#g')/models"
      for name in grok-image.json grok-image-edit.json grok-video.json; do
        if run_sudo test -f "$candidate/models/$name"; then
          run_sudo cp -a "$candidate/models/$name" "$BACKUP_DIR/workbench-web/$(echo "$candidate" | sed 's#[/:]#_#g')/models/$name"
        fi
        run_sudo install -m 0644 "$MODEL_SRC/$name" "$candidate/models/$name"
      done
      installed=1
    fi
  done
  if [ "$installed" -eq 0 ]; then
    log "no existing workbench-web directory found; skipped canvas model config install"
  fi
}
install_workbench_models

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; keeping packaged dist"
    run_sudo install -m 0644 "$API_DIST/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
    run_sudo install -m 0644 "$API_DIST/upstream.js" "$APP_DIR/api-server/dist/upstream.js"
    run_sudo install -m 0644 "$API_DIST/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
    run_sudo install -m 0644 "$API_DIST/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"
    run_sudo install -m 0644 "$API_DIST/apply-grok-media-channel.js" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "apply Grok media database channel"
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
  run_sudo bash -lc "cd '$APP_DIR/api-server' && CLIPROXY_XAI_BASE_URL='$CLIPROXY_XAI_BASE_URL' CLIPROXY_XAI_API_KEY='$DETECTED_CLIPROXY_XAI_API_KEY' node dist/apply-grok-media-channel.js"
elif run_sudo bash -lc "cd '$APP_DIR/api-server' && [ -f .env ] && grep -q '^CLIPROXY_XAI_API_KEY=' .env"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && set -a && . ./.env && set +a && CLIPROXY_XAI_BASE_URL='${CLIPROXY_XAI_BASE_URL}' node dist/apply-grok-media-channel.js"
else
  log "CLIPROXY_XAI_API_KEY not set; skipped DB channel apply. Run it later with CLIPROXY_XAI_API_KEY."
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "'grok-video': { submit: submitGrokVideo, query: queryGenericVideo }" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "reference_image_urls" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "disableLegacyGrokChannels" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
run_sudo grep -Fq "grok:media:apply" "$APP_DIR/api-server/package.json"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
