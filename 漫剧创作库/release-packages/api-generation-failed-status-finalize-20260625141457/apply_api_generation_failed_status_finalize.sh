#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_DIR="/var/www/ai-admin/backups/api-generation-failed-status-finalize-$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

FILES=(
  "src/modules/generation/routes.ts"
  "dist/modules/generation/routes.js"
  "src/modules/generation/adapters/registry.ts"
  "dist/modules/generation/adapters/registry.js"
)

for rel in "${FILES[@]}"; do
  [[ -f "$TMP_DIR/payload/$rel" ]] || { echo "Missing payload file: $rel" >&2; exit 1; }
  [[ -f "$APP_DIR/$rel" ]] || { echo "Missing target file: $APP_DIR/$rel" >&2; exit 1; }
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp "$APP_DIR/$rel" "$BACKUP_DIR/$rel"
  install -m 0644 "$TMP_DIR/payload/$rel" "$APP_DIR/$rel"
done

grep -q "return isFailedTaskStatus(status)" "$APP_DIR/src/modules/generation/adapters/registry.ts"
grep -q "return isFailedTaskStatus(status)" "$APP_DIR/dist/modules/generation/adapters/registry.js"
grep -q "normalizedTask" "$APP_DIR/src/modules/generation/routes.ts"
grep -q "normalizedTask" "$APP_DIR/dist/modules/generation/routes.js"

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

echo "Updated generation failed-status finalization"
echo "Backup: $BACKUP_DIR"
