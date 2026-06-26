#!/usr/bin/env bash
set -euo pipefail

echo "--- date ---"
date

echo "--- process summary ---"
systemctl --no-pager --type=service | grep -Ei 'ai|api|node|pm2|admin' || true
pm2 list 2>/dev/null || true
ps -eo pid,user,cmd | grep -E 'node|pm2|api-server|ai-admin' | grep -v grep || true

echo "--- likely app dirs ---"
find /var/www -maxdepth 4 -type f \( -name package.json -o -name ecosystem.config.js -o -name ".env" \) 2>/dev/null | sort || true

echo "--- recent nginx api errors ---"
grep -n "generate/llm/chat\\|UPSTREAM\\|upstream" /var/log/nginx/error.log 2>/dev/null | tail -80 || true

echo "--- recent app logs: pm2 ---"
pm2 logs --lines 120 --nostream 2>/dev/null | sed -E 's/(api[_-]?key|API[_-]?KEY|authorization|Authorization|token|TOKEN|secret|SECRET)[^[:space:]]*/\\1=REDACTED/g' || true

echo "--- journal node/api logs ---"
journalctl --no-pager -n 160 2>/dev/null | grep -Ei 'llm/chat|generate|upstream|error|api-server|node' | tail -120 | sed -E 's/(api[_-]?key|API[_-]?KEY|authorization|Authorization|token|TOKEN|secret|SECRET)[^[:space:]]*/\\1=REDACTED/g' || true

echo "--- api-server route source on server ---"
for file in \
  /var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generate/routes.js \
  /var/www/ai-admin/ai-admin-platform/api-server/src/modules/generate/routes.ts \
  /var/www/ai-admin/api-server/dist/modules/generate/routes.js \
  /var/www/ai-admin/api-server/src/modules/generate/routes.ts
do
  if [[ -f "$file" ]]; then
    echo "FILE: $file"
    grep -n "llm/chat\\|chatSchema\\|requestPayload\\|extra" "$file" | head -80 || true
  fi
done

echo "--- prisma env/database redacted ---"
for env_file in \
  /var/www/ai-admin/ai-admin-platform/api-server/.env \
  /var/www/ai-admin/api-server/.env
do
  if [[ -f "$env_file" ]]; then
    echo "ENV: $env_file"
    grep -E 'DATABASE_URL|PORT|NODE_ENV' "$env_file" | sed -E 's#(://)[^:@/]+(:)[^@/]+@#\\1USER\\2PASS@#g' || true
  fi
done
