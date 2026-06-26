#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ai-admin"
REGISTRY_DIST="${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js"
REGISTRY_SRC="${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts"

echo "== seedance-full marker check =="
date '+%Y-%m-%d %H:%M:%S %z'
echo "dist=${REGISTRY_DIST}"

echo
echo "== dist markers =="
grep -n "SEEDANCE_FULL_RESILIENT_STATUS_HOST" "${REGISTRY_DIST}" || true
grep -n "SEEDANCE_FULL_STATUS_RETRY_DELAYS_MS" "${REGISTRY_DIST}" || true
grep -n "seedanceFullTransientRunningResult" "${REGISTRY_DIST}" || true
grep -n "30000" "${REGISTRY_DIST}" | head -5 || true

echo
echo "== src markers =="
grep -n "SEEDANCE_FULL_RESILIENT_STATUS_HOST" "${REGISTRY_SRC}" || true
grep -n "SEEDANCE_FULL_STATUS_RETRY_DELAYS_MS" "${REGISTRY_SRC}" || true
grep -n "seedanceFullTransientRunningResult" "${REGISTRY_SRC}" || true
grep -n "30000" "${REGISTRY_SRC}" | head -5 || true

echo
echo "== pm2 =="
sudo -H -u ubuntu bash -lc 'pm2 status ai-admin-api' || pm2 status ai-admin-api || true

echo
echo "== health =="
curl -sS -m 5 http://127.0.0.1:3001/api/health || curl -sS -m 5 http://127.0.0.1/api/health || true
echo
