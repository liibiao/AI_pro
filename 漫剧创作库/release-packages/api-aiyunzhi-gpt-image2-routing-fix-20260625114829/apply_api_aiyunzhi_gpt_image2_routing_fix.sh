#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_DIR="/var/www/ai-admin/backups/api-aiyunzhi-gpt-image2-routing-fix-$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

declare -a FILES=(
  "src/modules/generation/routes.ts"
  "dist/modules/generation/routes.js"
  "src/modules/generation/adapters/registry.ts"
  "dist/modules/generation/adapters/registry.js"
)

for rel in "${FILES[@]}"; do
  [[ -f "$TMP_DIR/payload/$rel" ]] || { echo "Missing payload file: $rel" >&2; exit 1; }
  [[ -f "$APP_DIR/$rel" ]] || { echo "Missing target file: $APP_DIR/$rel" >&2; exit 1; }
done

for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp "$APP_DIR/$rel" "$BACKUP_DIR/$rel"
  install -m 0644 "$TMP_DIR/payload/$rel" "$APP_DIR/$rel"
done

for target in "$APP_DIR/src/modules/generation/routes.ts" "$APP_DIR/dist/modules/generation/routes.js"; do
  grep -q "isAiyunzhiGptImage2Hint" "$target"
  grep -q "aiyunzhi.top" "$target"
  grep -q "return 'aiyunzhi-gpt-image-2'" "$target"
done

for target in "$APP_DIR/src/modules/generation/adapters/registry.ts" "$APP_DIR/dist/modules/generation/adapters/registry.js"; do
  grep -q "'aiyunzhi-gpt-image-2'.*queryGenericImage" "$target"
  grep -q "resolveAiyunzhiGptImage2ModelName" "$target"
  grep -q "normalizeAiyunzhiGptImage2Response" "$target"
  grep -q "server_base64_async_object_storage" "$target"
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

echo "Updated API GPT-Image-2 routing and adapter files"
echo "Backup: $BACKUP_DIR"
