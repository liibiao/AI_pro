#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_HOST="${REMOTE_HOST:-124.156.137.236}"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"
REMOTE_PKG="${REMOTE_PKG:-/tmp/model-upload-async-cos-option-20260531.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_PARENT="$(dirname "$PKG_DIR")"
PKG_NAME="$(basename "$PKG_DIR")"
LOCAL_PKG="${LOCAL_PKG:-$PKG_PARENT/${PKG_NAME}.tar.gz}"
APPLY_SCRIPT="$SCRIPT_DIR/apply-model-upload-async-cos-option-20260531-on-server.sh"

log(){ printf '[deploy-124] %s\n' "$*"; }

test -f "$APPLY_SCRIPT" || { echo "缺少服务端部署脚本: $APPLY_SCRIPT" >&2; exit 1; }
test -f "$PKG_DIR/admin-web/src/main.tsx" || { echo "部署包缺少 admin-web/src/main.tsx" >&2; exit 1; }
test -d "$PKG_DIR/admin-web/dist" || { echo "部署包缺少 admin-web/dist" >&2; exit 1; }
test -f "$PKG_DIR/api-server/dist/modules/models/routes.js" || { echo "部署包缺少后端 dist" >&2; exit 1; }

log "create package: $LOCAL_PKG"
tar -czf "$LOCAL_PKG" -C "$PKG_PARENT" "$PKG_NAME"

log "upload package to $REMOTE:$REMOTE_PKG"
scp "$LOCAL_PKG" "$REMOTE:$REMOTE_PKG"

log "apply on 124 server"
ssh "$REMOTE" "APP_DIR='$APP_DIR' sudo -E bash -s -- '$REMOTE_PKG'" < "$APPLY_SCRIPT"

log "done"
echo "package: $LOCAL_PKG"
