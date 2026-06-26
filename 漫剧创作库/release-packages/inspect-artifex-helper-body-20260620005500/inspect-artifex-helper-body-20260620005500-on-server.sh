#!/usr/bin/env bash
set -euo pipefail

API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"

for file in \
  "$API_ROOT/src/modules/generation/adapters/registry.ts" \
  "$API_ROOT/dist/modules/generation/adapters/registry.js" \
  "$API_ROOT/src/modules/generation/adapters/registry.ts.bak-artifex-video-pro-1080p-20260619152039" \
  "$API_ROOT/dist/modules/generation/adapters/registry.js.bak-artifex-video-pro-1080p-20260619152039"; do
  [[ -f "$file" ]] || continue
  echo "===== $file current/candidate ====="
  sed -n '3800,3865p' "$file" || true
  echo "----- helper area -----"
  sed -n '4600,4855p' "$file" || true
done
