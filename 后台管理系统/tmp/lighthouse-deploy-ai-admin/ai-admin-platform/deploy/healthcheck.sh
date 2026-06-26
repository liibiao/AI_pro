#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4000}"

curl -fsS "$BASE_URL/api/health" >/dev/null
echo "API health OK: $BASE_URL/api/health"
