#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANGA_DIR="/Users/billy/Documents/AI_pro/漫剧创作库"
PID_DIR="$ROOT_DIR/.dev/pids"
STUDIO_CLI="$MANGA_DIR/studio"

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

stop_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [ ! -f "$pid_file" ]; then
    echo "[SKIP] $name 未记录 PID"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    stop_pid_value "$pid"
    echo "[STOP] $name PID=$pid"
  else
    echo "[SKIP] $name 进程已不存在"
  fi
  rm -f "$pid_file"
}

stop_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi
  for pid in $pids; do
    stop_pid_value "$pid"
    echo "[STOP] $name port=$port PID=$pid"
  done
}

stop_pid "admin-web"
stop_pid "api-server"
stop_port "admin-web" "5173"
stop_port "api-server" "4000"

if [ -x "$STUDIO_CLI" ]; then
  (cd "$MANGA_DIR" && "$STUDIO_CLI" stop >/dev/null 2>&1 || true)
  echo "[STOP] studio canvas"
fi

echo "停止完成"
