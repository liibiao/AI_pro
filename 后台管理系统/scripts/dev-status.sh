#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.dev/pids"
LOG_DIR="$ROOT_DIR/.dev/logs"

check_url() {
  local name="$1"
  local url="$2"
  if python3 - "$url" <<'PY'
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=1.5)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
  then
    echo "[UP]   $name $url"
  else
    echo "[DOWN] $name $url"
  fi
}

check_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  local pid=""
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "[PID]  $name $pid"
      return
    fi
  fi
  case "$name" in
    api-server)
      pid="$(lsof -tiTCP:4000 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
      ;;
    admin-web)
      pid="$(lsof -tiTCP:5173 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
      ;;
  esac
  if [ -n "$pid" ]; then
    echo "[PID]  $name $pid"
    return
  fi
  echo "[PID]  $name -"
}

check_pid "api-server"
check_pid "admin-web"
check_url "后台 API" "http://127.0.0.1:4000/api/health"
check_url "后台管理前端" "http://127.0.0.1:5173"
check_url "画布工作台" "http://127.0.0.1:8766/workbench.html"
echo "[LOG]  $LOG_DIR"
