#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/svp-interaction-nonblocking-20260623020114-${STAMP}"

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
  grep -Fq "async function selectShotVideoPromptSegmentFast(n,segmentId)" "$file"
  grep -Fq "function syncShotVideoPromptStoryboardStatusDom(id,seg)" "$file"
  grep -Fq "function runShotVideoPromptButtonTask(btn,label,fn)" "$file"
  grep -Fq "加载提示词..." "$file"
  grep -Fq "runShotVideoPromptButtonTask(btn,'打开中',()=>openShotVideoPromptSegmentEditor" "$file"
  grep -Fq "runShotVideoPromptButtonTask(btn,'生成中',()=>generateShotVideoPromptStoryboardGrid" "$file"
  grep -Fq "runShotVideoPromptButtonTask(btn,'打开中',()=>createShotVideoPromptStoryboardEditor" "$file"
  grep -Fq "runShotVideoPromptButtonTask(btn,'批量中',()=>generateAllShotVideoPromptStoryboardGrids" "$file"
  grep -Fq "runShotVideoPromptButtonTask(btn,'创建中',()=>createSeedanceFromShotVideoPrompt" "$file"
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

echo "deployed svp-interaction-nonblocking-20260623020114"
echo "backup: $BACKUP_DIR"
