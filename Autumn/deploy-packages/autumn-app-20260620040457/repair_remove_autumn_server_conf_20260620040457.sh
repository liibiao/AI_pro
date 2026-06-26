#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/nginx/conf.d/autumn-app.conf"
if [ -f "$CONF" ]; then
  rm -f "$CONF"
fi

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || service nginx reload || true
fi

echo "Removed isolated Autumn server block: ${CONF}"
