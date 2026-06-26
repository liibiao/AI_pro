#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_USER="${PM2_USER:-ubuntu}"

if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "Usage: BACKEND_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/package.tar.gz" >&2
  exit 1
fi
if [[ ! -d "$BACKEND_DIR/api-server" ]]; then
  echo "Backend dir not found: $BACKEND_DIR/api-server" >&2
  exit 1
fi

WORKDIR="$(mktemp -d /tmp/generation-list-asset-edits-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Extract package"
tar -xzf "$PKG" -C "$WORKDIR"

echo "==> Deploy api-server source/dist"
cp -R "$WORKDIR/api-server/src/." "$BACKEND_DIR/api-server/src/"
cp -R "$WORKDIR/api-server/dist/." "$BACKEND_DIR/api-server/dist/"

if [[ -d "$BACKEND_DIR/admin-web" && -d "$WORKDIR/admin-web/dist" ]]; then
  echo "==> Deploy admin-web dist/source"
  mkdir -p "$BACKEND_DIR/admin-web/dist"
  rm -rf "$BACKEND_DIR/admin-web/dist/assets"
  cp -R "$WORKDIR/admin-web/dist/." "$BACKEND_DIR/admin-web/dist/"
  if [[ -d "$WORKDIR/admin-web/src" ]]; then
    cp -R "$WORKDIR/admin-web/src/." "$BACKEND_DIR/admin-web/src/"
  fi
fi

echo "==> Remove macOS AppleDouble files"
find "$BACKEND_DIR/api-server/src" "$BACKEND_DIR/api-server/dist" "$BACKEND_DIR/admin-web/dist" -name '._*' -print -delete 2>/dev/null || true

echo "==> Restart backend PM2 if available"
if command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && sudo -u "$PM2_USER" pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u "$PM2_USER" pm2 restart ai-admin-api --update-env
  sudo -u "$PM2_USER" pm2 save || true
else
  echo "WARN: PM2 process ai-admin-api not found. Restart manually if this server uses another PM2 user/name."
fi

echo "==> Verify key markers"
grep -n "sanitizeGenerationTaskListItem" "$BACKEND_DIR/api-server/dist/modules/generation/routes.js" | head -3
grep -n "openAiImageUpstreamOptions" "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js" | head -3
grep -n "apiListItems" "$BACKEND_DIR/admin-web/dist/assets"/*.js | head -3

echo "Done."
