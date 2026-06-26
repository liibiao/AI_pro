#!/usr/bin/env bash
set -euo pipefail

echo "--- date ---"
date

echo "--- nginx status ---"
systemctl is-active nginx || true
nginx -t || true

echo "--- server roots and autumn locations ---"
grep -R "server_name\\|root /var/www\\|alias /var/www\\|location /autumn\\|rewrite .*autumn\\|return 302" -n \
  /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true

echo "--- enabled sites ---"
ls -la /etc/nginx/sites-enabled || true

echo "--- autumn links ---"
ls -ld \
  /var/www/autumn-app \
  /var/www/autumn-app/current \
  /var/www/html/autumn \
  /var/www/ai-admin/ai-admin-platform/admin-web/dist/autumn \
  /var/www/ai-admin/workbench-web/autumn \
  2>/dev/null || true

echo "--- root dirs ---"
ls -la /var/www/html 2>/dev/null | head -80 || true
ls -la /var/www/ai-admin/ai-admin-platform/admin-web/dist 2>/dev/null | head -80 || true
ls -la /var/www/ai-admin/workbench-web 2>/dev/null | head -80 || true

echo "--- autumn current ---"
readlink -f /var/www/autumn-app/current 2>/dev/null || true
find -L /var/www/autumn-app/current -maxdepth 2 -type f 2>/dev/null | head -40 || true

echo "--- nginx recent errors ---"
tail -80 /var/log/nginx/error.log 2>/dev/null || true
