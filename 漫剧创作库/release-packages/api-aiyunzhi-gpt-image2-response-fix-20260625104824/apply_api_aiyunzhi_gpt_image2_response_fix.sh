#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_DIR="/var/www/ai-admin/backups/api-aiyunzhi-gpt-image2-response-fix-$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC_TS="$TMP_DIR/payload/src/modules/generation/adapters/registry.ts"
SRC_JS="$TMP_DIR/payload/dist/modules/generation/adapters/registry.js"
TARGET_TS="$APP_DIR/src/modules/generation/adapters/registry.ts"
TARGET_JS="$APP_DIR/dist/modules/generation/adapters/registry.js"

[[ -f "$SRC_TS" ]] || { echo "Missing $SRC_TS" >&2; exit 1; }
[[ -f "$SRC_JS" ]] || { echo "Missing $SRC_JS" >&2; exit 1; }
[[ -f "$TARGET_TS" ]] || { echo "Missing $TARGET_TS" >&2; exit 1; }
[[ -f "$TARGET_JS" ]] || { echo "Missing $TARGET_JS" >&2; exit 1; }

mkdir -p "$BACKUP_DIR/src/modules/generation/adapters" "$BACKUP_DIR/dist/modules/generation/adapters"
cp "$TARGET_TS" "$BACKUP_DIR/src/modules/generation/adapters/registry.ts"
cp "$TARGET_JS" "$BACKUP_DIR/dist/modules/generation/adapters/registry.js"

install -m 0644 "$SRC_TS" "$TARGET_TS"
install -m 0644 "$SRC_JS" "$TARGET_JS"

for target in "$TARGET_TS" "$TARGET_JS"; do
  grep -q "'aiyunzhi-gpt-image-2'.*queryGenericImage" "$target"
  grep -q "resolveAiyunzhiGptImage2ModelName" "$target"
  grep -q "normalizeAiyunzhiGptImage2Response" "$target"
  grep -q "server_base64_async_object_storage" "$target"
  grep -q "responseType === 'server_base64_object_storage'" "$target"
done

if command -v pm2 >/dev/null 2>&1 && sudo -u ubuntu -H pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu -H pm2 restart ai-admin-api --update-env >/dev/null
elif command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env >/dev/null
elif systemctl list-unit-files ai-admin-api.service >/dev/null 2>&1; then
  systemctl restart ai-admin-api
  systemctl is-active --quiet ai-admin-api
else
  echo "Cannot find ai-admin-api process manager" >&2
  exit 1
fi

echo "Updated API adapter files"
echo "Backup: $BACKUP_DIR"
