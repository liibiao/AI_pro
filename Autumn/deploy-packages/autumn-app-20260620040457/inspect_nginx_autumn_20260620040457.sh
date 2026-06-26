#!/usr/bin/env bash
set -euo pipefail

echo "== nginx conf test =="
nginx -t || true

echo "== sites-enabled =="
ls -la /etc/nginx/sites-enabled 2>/dev/null || true

echo "== conf.d =="
ls -la /etc/nginx/conf.d 2>/dev/null || true

echo "== selected config lines =="
grep -RInE 'listen|server_name|root |alias |location /|location \^~ /|include ' \
  /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true

echo "== full sites-enabled files =="
for file in /etc/nginx/sites-enabled/*; do
  [ -f "$file" ] || continue
  echo "--- $file ---"
  sed -n '1,220p' "$file"
done

echo "== full conf.d files =="
for file in /etc/nginx/conf.d/*.conf; do
  [ -f "$file" ] || continue
  echo "--- $file ---"
  sed -n '1,220p' "$file"
done
