#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/shot-video-prompt-final-action-v5-20260617035245-${STAMP}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

required_files=(
  "workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/image-studio-canvas-next.html"
)
for rel in "${required_files[@]}"; do
  test -f "$WORKDIR/$rel"
done

check_file(){
  local file="$1"
  grep -q "20260617-final-director-action-method-v5" "$file"
  grep -q "SHOT_VIDEO_PROMPT_PHASES" "$file"
  grep -q "Math.ceil(total/1.5)" "$file"
  grep -q "shotVideoPromptPhaseActionText" "$file"
  grep -q "动作方法论：" "$file"
  grep -q "力的闭环：" "$file"
  grep -q "长版详细度门禁" "$file"
  grep -q "shotVideoPromptPromptHtml" "$file"
  grep -q "svp-image-prefix" "$file"
  grep -q "svp-edit-preview" "$file"
  grep -q "data-svp-drag-handle" "$file"
  grep -q "shotVideoDragHandle" "$file"
  grep -q "generateAllShotVideoPromptStoryboardGrids" "$file"
  grep -q "data-svp-resource-clip" "$file"
  grep -q "svp-floating-preview" "$file"
  if grep -q "20260617-long-template-storygrid-v3" "$file"; then
    echo "old shot-video-prompt v3 marker found in $file" >&2
    exit 1
  fi
}

for rel in "${required_files[@]}"; do
  check_file "$WORKDIR/$rel"
done

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/tools" "$PUBLIC_ROOT" "$TOOLS_ROOT"
[ -f "$PUBLIC_ROOT/image-studio-canvas-next.html" ] && cp "$PUBLIC_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/public/image-studio-canvas-next.html"
[ -f "$TOOLS_ROOT/image-studio-canvas-next.html" ] && cp "$TOOLS_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/tools/image-studio-canvas-next.html"

install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"

check_file "$PUBLIC_ROOT/image-studio-canvas-next.html"
check_file "$TOOLS_ROOT/image-studio-canvas-next.html"

echo "deployed shot-video-prompt-final-action-v5-20260617035245"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT/image-studio-canvas-next.html"
echo "tools: $TOOLS_ROOT/image-studio-canvas-next.html"
