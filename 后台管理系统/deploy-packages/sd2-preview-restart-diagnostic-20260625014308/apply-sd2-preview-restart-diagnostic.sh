#!/usr/bin/env bash
set -u
ARCHIVE_PATH="${1:-}"
echo "whoami=$(whoami)"
echo "pwd=$(pwd)"
echo "--- marker files ---"
for f in \
  /var/www/ai-admin/api-server/dist/modules/generation/adapters/registry.js \
  /var/www/ai-admin/api-server/src/modules/generation/adapters/registry.ts; do
  if [ -f "$f" ]; then
    echo "FOUND $f"
    grep -n "resolveSeedance2ModelByResolution\|sd2-\${requestedResolution}-\${sd2Variant\[1\]\.toLowerCase()}" "$f" | head -8 || true
  else
    echo "MISSING $f"
  fi
done
echo "--- pm2 root ---"
pm2 list || true
echo "--- pm2 ubuntu ---"
sudo -H -u ubuntu bash -lc 'pm2 list || true' || true
echo "--- restart attempts ---"
pm2 restart ai-admin-api --update-env || true
sudo -H -u ubuntu bash -lc 'pm2 restart ai-admin-api --update-env || pm2 restart all --update-env || true' || true
systemctl restart ai-admin-api || true
systemctl restart ai-admin || true
echo "--- pm2 root after ---"
pm2 list || true
echo "--- pm2 ubuntu after ---"
sudo -H -u ubuntu bash -lc 'pm2 list || true' || true
echo "--- systemd status ---"
systemctl is-active ai-admin-api || true
systemctl is-active ai-admin || true
