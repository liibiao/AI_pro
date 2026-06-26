#!/usr/bin/env bash
set -euo pipefail

PM2_ENV=(env PM2_HOME=/home/ubuntu/.pm2)
PM2=(sudo -u ubuntu -H "${PM2_ENV[@]}" pm2)

echo "[restart] ubuntu pm2 list before"
"${PM2[@]}" list || true

if "${PM2[@]}" show ai-admin-api >/dev/null 2>&1; then
  echo "[restart] restart ai-admin-api"
  "${PM2[@]}" restart ai-admin-api --update-env
else
  echo "[restart] ai-admin-api name not found; restart all ubuntu pm2 processes"
  "${PM2[@]}" restart all --update-env
fi

"${PM2[@]}" save || true

echo "[restart] ubuntu pm2 list after"
"${PM2[@]}" list || true
