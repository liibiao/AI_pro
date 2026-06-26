#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_DIR="/var/www/ai-admin/backups/api-gpt2-lowprice-route-restore-$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

for rel in "src/modules/generation/routes.ts" "dist/modules/generation/routes.js"; do
  [[ -f "$TMP_DIR/payload/$rel" ]] || { echo "Missing payload file: $rel" >&2; exit 1; }
  [[ -f "$APP_DIR/$rel" ]] || { echo "Missing target file: $APP_DIR/$rel" >&2; exit 1; }
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp "$APP_DIR/$rel" "$BACKUP_DIR/$rel"
  install -m 0644 "$TMP_DIR/payload/$rel" "$APP_DIR/$rel"
done

for target in "$APP_DIR/src/modules/generation/routes.ts" "$APP_DIR/dist/modules/generation/routes.js"; do
  grep -q "isLegacyAiyunzhiGptImage2LowPriceHint" "$target"
  grep -q "canvas_aiyunzhi-gpt-image-2-api" "$target"
  grep -q "gpt-image-2-max" "$target"
  grep -q "gpt-image-2-plus" "$target"
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

echo "Restored GPT 2 low-price route to legacy adapter"
echo "Backup: $BACKUP_DIR"
