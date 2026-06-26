#!/usr/bin/env bash
set -euo pipefail

API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"

echo "[inspect] grep exact symbol"
grep -RIn "isArtifexSeedance2Channel" "$API_ROOT/src" "$API_ROOT/dist" || true

echo "[inspect] route context"
for file in \
  "$API_ROOT/src/modules/generation/routes.ts" \
  "$API_ROOT/dist/modules/generation/routes.js" \
  "$API_ROOT/src/modules/generation/adapters/registry.ts" \
  "$API_ROOT/dist/modules/generation/adapters/registry.js"; do
  [[ -f "$file" ]] || continue
  echo "===== $file ====="
  grep -n "isArtifexSeedance2Channel\\|function .*Channel\\|const .*Channel\\|adapter.*seedance2\\|artifex-seedance2" "$file" | sed -n '1,180p' || true
done
