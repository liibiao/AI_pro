#!/usr/bin/env bash
set -euo pipefail

PKG="text-prompt-direct-chat-first-20260623120729"
ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"

DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

check_markers(){
  local file="$1"
  test -f "$file"
  grep -q "let directChatFailed=false" "$file"
  grep -q "LLM 直连不可用，切换 text-agent/run 兼容兜底" "$file"
  grep -q "direct LLM chat failed, fallback to text agent route" "$file"
  grep -q "text-agent/run 兼容兜底失败" "$file"
  grep -q "LLM 直连失败：" "$file"
  grep -q "兼容 Agent 路由" "$file"
  if grep -q "文本 Agent 路由不可用，携带 Agent 标识切换为 LLM 直连兜底" "$file"; then
    echo "old text-agent-first fallback message still present in $file" >&2
    exit 1
  fi
}

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  check_markers "$file"
done

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web" \
  "$(dirname "$DST_PUBLIC")" \
  "$(dirname "$DST_TOOLS")"

if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

check_markers "$DST_PUBLIC"
check_markers "$DST_TOOLS"

echo "deployed ${PKG}"
echo "backup: $BACKUP_DIR"
