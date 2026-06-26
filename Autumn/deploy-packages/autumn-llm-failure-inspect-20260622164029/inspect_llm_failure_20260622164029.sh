#!/usr/bin/env bash
set -euo pipefail

echo "== time =="
date -Is

echo
echo "== nginx access recent llm chat =="
for log in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
  if [[ -f "${log}" ]]; then
    echo "-- ${log}"
    grep -n "generate/llm/chat" "${log}" 2>/dev/null | tail -30 || true
  fi
done

echo
echo "== nginx error recent =="
for log in /var/log/nginx/error.log /var/log/nginx/error.log.1; do
  if [[ -f "${log}" ]]; then
    echo "-- ${log}"
    grep -n "generate/llm/chat\\|upstream\\|error" "${log}" 2>/dev/null | tail -80 || true
  fi
done

echo
echo "== pm2 list =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
fi

echo
echo "== api server route snippets =="
for file in \
  /var/www/ai-admin/ai-admin-platform/api-server/src/modules/generate/routes.ts \
  /var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generate/routes.js; do
  if [[ -f "${file}" ]]; then
    echo "-- ${file}"
    grep -n "chatSchema\\|generate/llm/chat\\|buildGenerateChatPayload\\|callUpstreamJson\\|recordFailedUsage\\|max_tokens\\|max_completion_tokens\\|temperature" "${file}" | head -160 || true
  fi
done

echo
echo "== api server env db url present =="
set +u
API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
if [[ -d "${API_DIR}" ]]; then
  cd "${API_DIR}"
  if [[ -f ".env" ]]; then
    grep -E "^(DATABASE_URL|NODE_ENV|PORT)=" .env | sed -E 's#(DATABASE_URL=)([^@/]+)@#\\1***@#' || true
  fi
fi
set -u

echo
echo "== recent llm model usages =="
API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
if [[ -f "${API_DIR}/.env" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "${API_DIR}/.env" | tail -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/^'\''//; s/'\''$//; s/\\?.*$//')"
  if command -v psql >/dev/null 2>&1 && [[ -n "${DB_URL}" ]]; then
    psql "${DB_URL}" -P pager=off -c "
      select
        created_at,
        model_id,
        status,
        left(coalesce(error_message, ''), 700) as error_message,
        left(coalesce(request_json::text, ''), 900) as request_json,
        left(coalesce(response_json::text, ''), 900) as response_json
      from model_usages
      where model_type = 'LLM'
        and created_at > now() - interval '3 hours'
      order by created_at desc
      limit 25;
    " || true
  fi
fi

echo
echo "== active llm models =="
if [[ -n "${DB_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  psql "${DB_URL}" -P pager=off -c "
    select
      m.id,
      m.model_key,
      m.name,
      m.display_name,
      m.endpoint_path as model_endpoint,
      m.adapter as model_adapter,
      m.status as model_status,
      p.provider_key,
      p.name as provider_name,
      p.base_url,
      p.endpoint_path as provider_endpoint,
      p.adapter as provider_adapter,
      p.status as provider_status
    from models m
    left join providers p on p.id = m.provider_id
    where m.type = 'LLM'
    order by m.status, m.display_name;
  " || true
fi

echo
echo "== api server logs tail =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 logs --nostream --lines 160 || true
else
  find /var/www/ai-admin -maxdepth 5 -type f \( -name "*.log" -o -name "pm2*.txt" \) -print 2>/dev/null | head -20 | while read -r log; do
    echo "-- ${log}"
    tail -80 "${log}" || true
  done
fi
