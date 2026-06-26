#!/usr/bin/env bash
set -euo pipefail
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
log(){ printf '==> %s\n' "$*"; }
log "本地文件校验"
grep -q "enterprise-generation-api.html" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -q "openApiDocs('enterprise')" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -q "创建和复制个人 API Key" "$BACKEND_DIR/docs/customer-generation-api.html"
grep -q "创建和复制企业 API Token" "$BACKEND_DIR/docs/enterprise-generation-api.html"
grep -q "canvas-sora-v3-pro" "$BACKEND_DIR/docs/enterprise-generation-api.html"
grep -q "img2video" "$BACKEND_DIR/docs/customer-generation-api.html"
log "HTTP 校验（失败时仍请检查 Nginx/端口）"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BASE_URL/docs/customer-generation-api.html" | grep -q "创建和复制个人 API Key"
  curl -fsSL "$BASE_URL/docs/enterprise-generation-api.html" | grep -q "创建和复制企业 API Token"
  curl -fsSL "$BASE_URL/docs/enterprise-generation-api.html" | grep -q "img2video"
fi
log "验证通过"
