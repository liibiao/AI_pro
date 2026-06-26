#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-next-asset-confirm-retry-lightbox-sidefix-20260616151949-${STAMP}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

required_files=(
  "workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/image-studio-canvas-next.html"
)

for rel in "${required_files[@]}"; do
  test -f "$WORKDIR/$rel"
done

for rel in "${required_files[@]}"; do
  grep -q "IMAGE_GENERATION_AUTO_RETRY_COUNT=2" "$WORKDIR/$rel"
  grep -q "runUnifiedImageGenerationTaskWithRetry" "$WORKDIR/$rel"
  grep -q "openAssetConfirmCardImageLightbox" "$WORKDIR/$rel"
  grep -q "data-asset-confirm-thumb" "$WORKDIR/$rel"
  grep -q "grid-template-columns:minmax(0,1fr) 250px" "$WORKDIR/$rel"
  grep -q "生成失败，可点击重新生成" "$WORKDIR/$rel"
  ! grep -q ">筛选状态<" "$WORKDIR/$rel"
done

node - "$WORKDIR/workbench-web/image-studio-canvas-next.html" <<'NODE'
const fs=require('fs');
const file=process.argv[2];
const html=fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
let chars=0;
for(const [i,s] of scripts.entries()){
  chars+=s.length;
  try{ new Function(s); }
  catch(err){
    console.error(`script ${i} syntax failed at ${chars-s.length}, len ${s.length}`);
    throw err;
  }
}
console.log(`syntax ok: ${scripts.length} scripts, ${chars} chars`);
NODE

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/tools" "$PUBLIC_ROOT" "$TOOLS_ROOT"

if [ -f "$PUBLIC_ROOT/image-studio-canvas-next.html" ]; then
  cp "$PUBLIC_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/public/image-studio-canvas-next.html"
fi
if [ -f "$TOOLS_ROOT/image-studio-canvas-next.html" ]; then
  cp "$TOOLS_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/tools/image-studio-canvas-next.html"
fi

install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"

grep -q "IMAGE_GENERATION_AUTO_RETRY_COUNT=2" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "runUnifiedImageGenerationTaskWithRetry" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "openAssetConfirmCardImageLightbox" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "data-asset-confirm-thumb" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "grid-template-columns:minmax(0,1fr) 250px" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "生成失败，可点击重新生成" "$PUBLIC_ROOT/image-studio-canvas-next.html"
! grep -q ">筛选状态<" "$PUBLIC_ROOT/image-studio-canvas-next.html"

echo "deployed canvas-next-asset-confirm-retry-lightbox-sidefix-20260616151949"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT"
echo "tools: $TOOLS_ROOT"
