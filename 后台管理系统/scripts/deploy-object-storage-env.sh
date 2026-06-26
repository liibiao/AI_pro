#!/usr/bin/env bash
set -euo pipefail

SRC_ENV="${SRC_ENV:-/Users/billy/Documents/AI_pro/漫剧创作库/.env}"
SSH_TARGET="${SSH_TARGET:-ubuntu@124.156.137.236}"
REMOTE_ENV="${REMOTE_ENV:-/var/www/ai-admin/ai-admin-platform/api-server/.env}"
REMOTE_ROOT_ENV="${REMOTE_ROOT_ENV:-/var/www/ai-admin/ai-admin-platform/.env}"

if [[ ! -f "$SRC_ENV" ]]; then
  echo "找不到本地对象存储配置文件: $SRC_ENV" >&2
  exit 1
fi

TMP_LOCAL="$(mktemp /tmp/object-storage-env.XXXXXX)"
REMOTE_TMP="/tmp/object-storage-env-$(date +%Y%m%d%H%M%S)-$$"
trap 'rm -f "$TMP_LOCAL"' EXIT

grep -E '^(OBJECT_STORAGE_|AWS_ACCESS_KEY_ID=|AWS_SECRET_ACCESS_KEY=)' "$SRC_ENV" > "$TMP_LOCAL" || true

required=(
  OBJECT_STORAGE_ENDPOINT_URL
  OBJECT_STORAGE_ACCESS_KEY_ID
  OBJECT_STORAGE_SECRET_ACCESS_KEY
  OBJECT_STORAGE_BUCKET
)

missing=()
for key in "${required[@]}"; do
  if ! grep -Eq "^${key}=.+$" "$TMP_LOCAL"; then
    missing+=("$key")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "本地配置缺少: ${missing[*]}" >&2
  exit 1
fi

echo "==> 本地对象存储配置检查通过"
awk -F= '
  /^OBJECT_STORAGE_/ {
    key=$1
    value=$0
    sub(/^[^=]*=/, "", value)
    gsub(/^["'\''"]|["'\''"]$/, "", value)
    if (key ~ /(SECRET|ACCESS_KEY_ID)/) {
      printf "%s=SET len=%d\n", key, length(value)
    } else {
      printf "%s=%s\n", key, value
    }
  }
' "$TMP_LOCAL"

echo "==> 上传配置片段到 $SSH_TARGET"
scp "$TMP_LOCAL" "$SSH_TARGET:$REMOTE_TMP"

echo "==> 合并到云服务器后端环境文件: $REMOTE_ENV 和 $REMOTE_ROOT_ENV"
ssh "$SSH_TARGET" "REMOTE_ENV='$REMOTE_ENV' REMOTE_ROOT_ENV='$REMOTE_ROOT_ENV' REMOTE_TMP='$REMOTE_TMP' bash -s" <<'REMOTE'
set -euo pipefail

merge_env_file() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  touch "$target"
  cp "$target" "$target.bak.$(date +%Y%m%d%H%M%S)"
  TARGET_ENV="$target" node --input-type=module <<'NODE'
import fs from 'node:fs';

const remoteEnv = process.env.TARGET_ENV;
const remoteTmp = process.env.REMOTE_TMP;

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    map.set(match[1], match[2]);
  }
  return map;
}

const incoming = parseEnv(fs.readFileSync(remoteTmp, 'utf8'));
const existingText = fs.readFileSync(remoteEnv, 'utf8');
const seen = new Set();
const lines = existingText.split(/\r?\n/).map((line) => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  if (!match) return line;
  const key = match[1];
  if (!incoming.has(key)) return line;
  seen.add(key);
  return `${key}=${incoming.get(key)}`;
});

for (const [key, value] of incoming) {
  if (!seen.has(key)) lines.push(`${key}=${value}`);
}

fs.writeFileSync(remoteEnv, lines.join('\n').replace(/\n*$/, '\n'));
NODE
}

merge_env_file "$REMOTE_ROOT_ENV"
merge_env_file "$REMOTE_ENV"

rm -f "$REMOTE_TMP"

echo "==> 重启后端并刷新环境"
pm2 restart ai-admin-api --update-env
sleep 2

cd /var/www/ai-admin/ai-admin-platform/api-server
ENV_FILE=../.env node --input-type=module <<'NODE'
import { config } from './dist/config.js';
const s = config.objectStorage;
console.log({
  provider: s.provider,
  endpointUrl: Boolean(s.endpointUrl),
  accessKeyId: Boolean(s.accessKeyId),
  secretAccessKey: Boolean(s.secretAccessKey),
  bucket: Boolean(s.bucket),
  publicBaseUrl: Boolean(s.publicBaseUrl),
  region: s.region,
  prefix: s.prefix
});
NODE

curl -sS http://127.0.0.1:4000/api/health
echo
REMOTE

echo "==> 对象存储环境已同步"
