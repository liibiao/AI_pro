#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: apply-admin-video-flat-resolution-pricing.sh <package.tar.gz>}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
ADMIN_WEB="$APP_ROOT/admin-web"
PATCH_NAME="patch-video-flat-resolution-pricing-ui.mjs"
PACKAGE_NAME="admin-video-flat-resolution-pricing-20260615131717"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups/${PACKAGE_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [ ! -d "$ADMIN_WEB/src" ]; then
  echo "admin web source not found: $ADMIN_WEB/src" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
cp "$ADMIN_WEB/src/main.tsx" "$BACKUP_ROOT/main.tsx"

tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
if [ -d "$WORK_DIR/$PACKAGE_NAME" ]; then
  PACKAGE_ROOT="$WORK_DIR/$PACKAGE_NAME"
else
  PACKAGE_ROOT="$WORK_DIR"
fi

if [ ! -f "$PACKAGE_ROOT/scripts/$PATCH_NAME" ]; then
  echo "patch script missing from package: scripts/$PATCH_NAME" >&2
  exit 1
fi

OWNER="$(stat -c '%u:%g' "$ADMIN_WEB/src/main.tsx")"
mkdir -p "$ADMIN_WEB/scripts"
cp "$PACKAGE_ROOT/scripts/$PATCH_NAME" "$ADMIN_WEB/scripts/$PATCH_NAME"
chown "$OWNER" "$ADMIN_WEB/scripts/$PATCH_NAME"

cd "$ADMIN_WEB"
node "scripts/$PATCH_NAME"
chown "$OWNER" "$ADMIN_WEB/src/main.tsx"

npm run build

if [ -d "$ADMIN_WEB/dist" ]; then
  chown -R "$OWNER" "$ADMIN_WEB/dist"
fi

grep -q "videoFlatTierPrices" "$ADMIN_WEB/src/main.tsx"
grep -q "videoFlatTierMemberPrice" "$ADMIN_WEB/src/main.tsx"
grep -q "默认会员积分/次" "$ADMIN_WEB/src/main.tsx"

echo "admin video flat resolution pricing UI deployed"
echo "backup: $BACKUP_ROOT"
