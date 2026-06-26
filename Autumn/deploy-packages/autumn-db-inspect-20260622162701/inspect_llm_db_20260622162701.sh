#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
ENV_FILE="${APP_DIR}/.env"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

echo "--- active llm models ---"
psql "${PSQL_DATABASE_URL}" -P pager=off -c "
select
  m.id,
  m.model_key,
  m.name as model_name,
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
from ai_models m
join upstream_providers p on p.id = m.provider_id
where m.type = 'LLM'
order by m.created_at desc;
"

echo "--- recent llm failures ---"
psql "${PSQL_DATABASE_URL}" -P pager=off -c "
select
  u.created_at,
  u.model_id,
  m.name as model_name,
  m.display_name,
  u.status,
  left(coalesce(u.error_message, ''), 700) as error_message,
  u.request_json ->> 'model' as request_model,
  case
    when u.request_json ? 'messages' then 'messages'
    when u.request_json ? 'input' then 'input'
    else ''
  end as request_shape,
  left((u.request_json)::text, 1000) as request_preview
from model_usages u
join ai_models m on m.id = u.model_id
where u.model_type = 'LLM'
order by u.created_at desc
limit 20;
"
