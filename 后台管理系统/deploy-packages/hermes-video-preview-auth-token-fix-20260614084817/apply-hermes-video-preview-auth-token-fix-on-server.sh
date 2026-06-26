#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
MANGA_ROOT="${MANGA_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/hermes-video-preview-auth-token-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/hermes-video-preview-auth-token-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"

REQ=(
  "api-server/src/modules/workbench-compat/routes.ts"
  "api-server/dist/modules/workbench-compat/routes.js"
  "tools/workbench-web/image-studio-canvas-next.html"
)
for path in "${REQ[@]}"; do
  test -s "$WORKDIR/$path" || { echo "missing package file: $path" >&2; exit 1; }
done

echo "[deploy] verify package markers"
grep -F "function requireAuthWithQueryToken" "$WORKDIR/api-server/src/modules/workbench-compat/routes.ts" >/dev/null
grep -F "req.query.authToken" "$WORKDIR/api-server/src/modules/workbench-compat/routes.ts" >/dev/null
grep -F "requireAuthWithQueryToken" "$WORKDIR/api-server/dist/modules/workbench-compat/routes.js" >/dev/null
grep -F "withWorkbenchVideoApiAuth" "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" >/dev/null
grep -F "authToken" "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" >/dev/null
grep -F "hermes.67611.top" "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" >/dev/null

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web" \
  "$BACKUP_DIR/manga/tools/workbench-web"

cp -a "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$MANGA_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/manga/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "[deploy] install backend source/dist"
install -m 0644 "$WORKDIR/api-server/src/modules/workbench-compat/routes.ts" "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
install -m 0644 "$WORKDIR/api-server/dist/modules/workbench-compat/routes.js" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"

echo "[deploy] install canvas html"
mkdir -p "$WORKBENCH_ROOT" "$REMOTE_ROOT/tools/workbench-web" "$MANGA_ROOT/tools/workbench-web"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$MANGA_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "[deploy] verify installed markers"
grep -F "function requireAuthWithQueryToken" "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" >/dev/null
grep -F "requireAuthWithQueryToken" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" >/dev/null
grep -F "withWorkbenchVideoApiAuth" "$WORKBENCH_ROOT/image-studio-canvas-next.html" >/dev/null
grep -F "authToken" "$WORKBENCH_ROOT/image-studio-canvas-next.html" >/dev/null

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  if sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save >/dev/null 2>&1 || true
  elif pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
    pm2 save >/dev/null 2>&1 || true
  else
    echo "[deploy] ai-admin-api pm2 process not found; skip restart" >&2
  fi
fi

curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
