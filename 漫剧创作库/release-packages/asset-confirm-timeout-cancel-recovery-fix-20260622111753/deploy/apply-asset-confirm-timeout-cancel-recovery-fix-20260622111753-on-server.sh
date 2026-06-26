#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-timeout-cancel-recovery-fix-20260622111753-${STAMP}"

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
  grep -Fq "const ASSET_CONFIRM_GENERATION_TIMEOUT_MS=15*60*1000;" "$file"
  grep -Fq "function markAssetConfirmCardGenerationFailed" "$file"
  grep -Fq "function failAssetConfirmCardIfTimedOut" "$file"
  grep -Fq "function cancelAssetConfirmCardGeneration" "$file"
  grep -Fq "const generateAction=genState.active?'cancelGeneration':'generate';" "$file"
  grep -Fq "if(action==='cancelGeneration')return cancelAssetConfirmCardGeneration" "$file"
  grep -Fq "未收到后台完成或失败结果，已停止等待" "$file"
  grep -Fq "if(state.failed)return false;" "$file"
  grep -Fq "modelLooksLikeSeedanceSd2Video(model)" "$file"
}

check_markers "$SRC_PUBLIC"
check_markers "$SRC_TOOLS"

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

echo "deployed asset-confirm-timeout-cancel-recovery-fix-20260622111753"
echo "backup: $BACKUP_DIR"
