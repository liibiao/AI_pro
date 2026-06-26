#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-gpt-base64-preview-async-cos-fix-20260608015432"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
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

verify_registry_markers(){
  local file="$1"
  grep -Fq "server_base64_async_object_storage" "$file"
  grep -Fq "return inlineImageDataUrl(result.b64, result.mimeType || 'image/png')" "$file"
  grep -Fq "if (/^data:image\\//i.test(directUrl)" "$file"
  grep -Fq "return directUrl" "$file"
  if grep -Fq "persistInlineImageLocalPreview(result.b64" "$file"; then
    fail "server_base64_async_object_storage still persists base64 to temporary URL in $file"
  fi
}

verify_registry_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "server_base64_async_object_storage" "$file"
  run_sudo grep -Fq "return inlineImageDataUrl(result.b64, result.mimeType || 'image/png')" "$file"
  run_sudo grep -Fq "if (/^data:image\\//i.test(directUrl)" "$file"
  run_sudo grep -Fq "return directUrl" "$file"
  if run_sudo grep -Fq "persistInlineImageLocalPreview(result.b64" "$file"; then
    fail "server_base64_async_object_storage still persists base64 to temporary URL in $file"
  fi
}

verify_canvas_markers(){
  local file="$1"
  grep -Fq "isServerGenerationResultUrl(normalized)?platformApiUrl(normalized):apiUrl(normalized)" "$file"
  grep -Fq "if(isServerGenerationResultUrl(ref))return platformApiUrl(ref)" "$file"
  grep -Fq "const display=toDisplayImageSrc(src)" "$file"
  grep -Fq "return platformApiUrl(ref)" "$file"
}

verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "isServerGenerationResultUrl(normalized)?platformApiUrl(normalized):apiUrl(normalized)" "$file"
  run_sudo grep -Fq "if(isServerGenerationResultUrl(ref))return platformApiUrl(ref)" "$file"
  run_sudo grep -Fq "const display=toDisplayImageSrc(src)" "$file"
  run_sudo grep -Fq "return platformApiUrl(ref)" "$file"
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

REGISTRY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
HTML_MIRROR_SRC="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"

[ -f "$REGISTRY_SRC" ] || fail "package missing api-server/src/modules/generation/adapters/registry.ts"
[ -f "$REGISTRY_DIST" ] || fail "package missing api-server/dist/modules/generation/adapters/registry.js"
[ -f "$HTML_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_MIRROR_SRC" ] || fail "package missing tools/workbench-web/image-studio-canvas-next.html"

log "verify package markers"
verify_registry_markers "$REGISTRY_SRC"
verify_registry_markers "$REGISTRY_DIST"
verify_canvas_markers "$HTML_SRC"
verify_canvas_markers "$HTML_MIRROR_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror/workbench-web"
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install api and canvas files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/generation/adapters" \
  "$WEB_ROOT/workbench-web"
run_sudo install -m 0644 "$REGISTRY_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$HTML_SRC" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  run_sudo install -m 0644 "$HTML_MIRROR_SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged registry dist"
    run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
verify_registry_markers_sudo "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
verify_registry_markers_sudo "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
verify_canvas_markers_sudo "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_canvas_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
