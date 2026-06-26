#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANGA_DIR="/Users/billy/Documents/AI_pro/漫剧创作库"
DEV_DIR="$ROOT_DIR/.dev"
LOG_DIR="$DEV_DIR/logs"
PID_DIR="$DEV_DIR/pids"

API_DIR="$ROOT_DIR/api-server"
WEB_DIR="$ROOT_DIR/admin-web"
STUDIO_CLI="$MANGA_DIR/studio"

API_PORT="4000"
WEB_PORT="5173"
API_URL="http://127.0.0.1:$API_PORT/api/health"
API_BASE_URL="http://127.0.0.1:$API_PORT"
WEB_URL="http://127.0.0.1:$WEB_PORT"
CANVAS_URL="http://127.0.0.1:8766/image-studio-canvas-next.html"
WORKBENCH_URL="http://127.0.0.1:8766/workbench.html"

mkdir -p "$LOG_DIR" "$PID_DIR"

is_up() {
  local url="$1"
  python3 - "$url" <<'PY'
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=1.5)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
}

port_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

stop_pid_value() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" || true
    fi
  fi
}

ensure_port_free() {
  local name="$1"
  local port="$2"
  local pid
  pid="$(port_pid "$port")"
  if [ -n "$pid" ]; then
    echo "[CLEAN] $name 端口 $port 被 PID=$pid 占用，先释放"
    stop_pid_value "$pid"
  fi
}

wait_for() {
  local name="$1"
  local url="$2"
  local tries="${3:-40}"
  for _ in $(seq 1 "$tries"); do
    if is_up "$url"; then
      echo "[OK] $name: $url"
      return 0
    fi
    sleep 0.5
  done
  echo "[FAIL] $name 启动超时：$url" >&2
  return 1
}

start_node_service() {
  local name="$1"
  local dir="$2"
  local port="$3"
  local object_storage_env_file="${4:-}"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [ -f "$pid_file" ]; then
    local old_pid
    old_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      echo "[CLEAN] $name 旧 PID=$old_pid"
      stop_pid_value "$old_pid"
    fi
    rm -f "$pid_file"
  fi

  ensure_port_free "$name" "$port"

  echo "[START] $name"
  if [ -n "$object_storage_env_file" ]; then
    (
      cd "$dir"
      OBJECT_STORAGE_ENV_FILE="$object_storage_env_file" nohup npm run dev > "$log_file" 2>&1 < /dev/null &
      echo $! > "$pid_file"
    )
  else
    (
      cd "$dir"
      nohup npm run dev > "$log_file" 2>&1 < /dev/null &
      echo $! > "$pid_file"
    )
  fi
}

API_OBJECT_STORAGE_ENV_FILE=""
if [ -f "$MANGA_DIR/.env" ] && grep -q '^OBJECT_STORAGE_' "$MANGA_DIR/.env"; then
  API_OBJECT_STORAGE_ENV_FILE="$MANGA_DIR/.env"
fi

start_node_service "api-server" "$API_DIR" "$API_PORT" "$API_OBJECT_STORAGE_ENV_FILE"
start_node_service "admin-web" "$WEB_DIR" "$WEB_PORT"

echo "[START] studio canvas"
(cd "$MANGA_DIR" && "$STUDIO_CLI" start >/dev/null 2>&1 || true)

wait_for "后台 API" "$API_URL" 50
wait_for "后台管理前端" "$WEB_URL" 50
wait_for "画布工作台" "$WORKBENCH_URL" 30

echo ""
echo "启动完成："
echo "- 后台 API：$API_BASE_URL"
echo "- 后台管理前端：$WEB_URL"
echo "- 画布：$CANVAS_URL"
echo "- 工作台：$WORKBENCH_URL"
echo "- 日志：$LOG_DIR"

if command -v open >/dev/null 2>&1; then
  open "$WEB_URL" >/dev/null 2>&1 || true
  open "$CANVAS_URL" >/dev/null 2>&1 || true
fi
