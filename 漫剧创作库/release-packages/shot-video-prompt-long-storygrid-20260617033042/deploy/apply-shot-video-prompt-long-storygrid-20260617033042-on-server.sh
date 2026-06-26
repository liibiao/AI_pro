#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/shot-video-prompt-long-storygrid-20260617033042-${STAMP}"
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
  grep -q "20260617-long-template-storygrid-v3" "$file"
  grep -q "## Seedance版（灵境长版母稿）" "$file"
  grep -q "要求：运镜必须绑定动作与表演；禁止独立镜头与构图段；沿用本项目门禁体系。" "$file"
  grep -q "<th>分镜图预览</th>" "$file"
  grep -q "generateAllShotVideoPromptStoryboardGrids" "$file"
  grep -q "data-svp-resource-clip" "$file"
  grep -q "svp-floating-preview" "$file"
  grep -q "const directTableMode=n.values.enableLlm===false" "$file"
  grep -q "使用现有分镜表生成宫格" "$file"
  grep -q "Array.from({length:16}" "$file"
  if grep -q "\[\['4','4宫格'\],\['6','6宫格'\],\['9','9宫格'\],\['16','16宫格'\],\['25','25宫格'\]\]" "$file"; then
    echo "storyboard grid selector is still hardcoded in $file" >&2
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

echo "deployed shot-video-prompt-long-storygrid-20260617033042"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT/image-studio-canvas-next.html"
echo "tools: $TOOLS_ROOT/image-studio-canvas-next.html"
