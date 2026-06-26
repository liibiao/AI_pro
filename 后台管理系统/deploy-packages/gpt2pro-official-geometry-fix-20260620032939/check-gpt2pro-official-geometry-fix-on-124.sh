#!/usr/bin/env bash
set +H
set -euo pipefail

APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -n "$APP_DIR" ] || { echo "APP_DIR not found" >&2; exit 1; }

grep -Fq "45.77.211.38:8317" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizedResolution === '1K' || normalizedResolution === '3K'" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image'" "$APP_DIR/api-server/dist/modules/generation/routes.js"

if command -v pm2 >/dev/null 2>&1; then
  pm2 show ai-admin-api >/dev/null 2>&1 \
    || sudo -n -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 show ai-admin-api >/dev/null
fi

curl -fsS http://127.0.0.1/api/health >/dev/null || curl -fsS http://124.156.137.236/api/health >/dev/null

echo "gpt2pro official geometry fix markers OK in $APP_DIR"
