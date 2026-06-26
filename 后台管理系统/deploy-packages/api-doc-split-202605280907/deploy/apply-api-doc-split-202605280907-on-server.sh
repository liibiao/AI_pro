#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-/tmp/api-doc-split-202605280907.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
log(){ printf '==> %s\n' "$*"; }
pm2_as_user(){ if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then pm2 "$@"; elif command -v sudo >/dev/null 2>&1; then sudo -u "$PM2_USER" pm2 "$@"; else return 0; fi; }
test -f "$PKG" || { echo "包不存在: $PKG" >&2; exit 1; }
test -d "$BACKEND_DIR/admin-web" || { echo "后台目录不正确: $BACKEND_DIR" >&2; exit 1; }
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/api-doc-split-202605280907-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"
SRC="$WORKDIR/api-doc-split-202605280907"
BACKUP="$BACKEND_DIR/backups/api-doc-split-202605280907-$STAMP"
log "备份当前前端与文档到 $BACKUP"
mkdir -p "$BACKUP" "$BACKEND_DIR/docs" "$BACKEND_DIR/admin-web/src" "$BACKEND_DIR/admin-web/dist"
cp -f "$BACKEND_DIR/admin-web/src/main.tsx" "$BACKUP/main.tsx.bak" 2>/dev/null || true
cp -R "$BACKEND_DIR/admin-web/dist" "$BACKUP/admin-web-dist" 2>/dev/null || true
cp -f "$BACKEND_DIR/docs/customer-generation-api.md" "$BACKUP/customer-generation-api.md.bak" 2>/dev/null || true
cp -f "$BACKEND_DIR/docs/customer-generation-api.html" "$BACKUP/customer-generation-api.html.bak" 2>/dev/null || true
cp -f "$BACKEND_DIR/docs/enterprise-generation-api.md" "$BACKUP/enterprise-generation-api.md.bak" 2>/dev/null || true
cp -f "$BACKEND_DIR/docs/enterprise-generation-api.html" "$BACKUP/enterprise-generation-api.html.bak" 2>/dev/null || true
log "覆盖 admin-web 源码与 dist"
cp -f "$SRC/admin-web/src/main.tsx" "$BACKEND_DIR/admin-web/src/main.tsx"
rm -rf "$BACKEND_DIR/admin-web/dist/assets"
cp -R "$SRC/admin-web/dist/." "$BACKEND_DIR/admin-web/dist/"
log "覆盖个人 / 企业 API 文档"
cp -f "$SRC/docs/customer-generation-api.md" "$BACKEND_DIR/docs/customer-generation-api.md"
cp -f "$SRC/docs/customer-generation-api.html" "$BACKEND_DIR/docs/customer-generation-api.html"
cp -f "$SRC/docs/enterprise-generation-api.md" "$BACKEND_DIR/docs/enterprise-generation-api.md"
cp -f "$SRC/docs/enterprise-generation-api.html" "$BACKEND_DIR/docs/enterprise-generation-api.html"
log "重启后台 PM2"
pm2_as_user restart "$PM2_APP" --update-env || pm2_as_user restart all --update-env || true
pm2_as_user save || true
log "校验关键标记"
grep -n "enterprise-generation-api.html" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "openApiDocs('enterprise')" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "创建和复制个人 API Key" "$BACKEND_DIR/docs/customer-generation-api.html"
grep -n "创建和复制企业 API Token" "$BACKEND_DIR/docs/enterprise-generation-api.html"
grep -n "img2video" "$BACKEND_DIR/docs/enterprise-generation-api.html" | head -5
log "部署完成"
