#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/shot-video-prompt-table-layout-20260617025610-${STAMP}"
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
  grep -q "visualNodeId:'',sourceText,globalStylePreset,assetRefs" "$file"
  grep -q "min-width:1080px!important" "$file"
  grep -q ".svp-segment-table tbody tr{height:156px!important;max-height:156px!important}" "$file"
  grep -q ".svp-prompt-scroll" "$file"
  grep -q "grid-template-columns:minmax(0,1fr)!important" "$file"
  if awk '/function createShotStoryboardAndVideoPromptFromAssetConfirm/,/function createAssetConfirmNodeFromTextPrompt/' "$file" | grep -q "createAssetDeriveShotStoryboardNode"; then
    echo "asset-confirm create action still creates an extra shot storyboard node in $file" >&2
    exit 1
  fi
  if awk '/function renderShotVideoPromptControls/,/function selectedShotVideoPromptSegment/' "$file" | grep -q 'class="svp-sidebar"'; then
    echo "shot video prompt controls still render the old sidebar layout in $file" >&2
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

echo "deployed shot-video-prompt-table-layout-20260617025610"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT/image-studio-canvas-next.html"
echo "tools: $TOOLS_ROOT/image-studio-canvas-next.html"
