#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-derive-step-progress-20260622230916-${STAMP}"

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
  grep -Fq "const logs=textPromptRuntimeLogs(n).slice(-8)" "$file"
  grep -Fq "const current=String(latest?.message||label||'正在执行资产推演步骤')" "$file"
  grep -Fq "data-asset-card-derive-progress><div class=\"asset-card-derive-progress-inner\"><b>\${esc(label)}</b><em>\${esc(current)}</em>" "$file"
  grep -Fq "setAssetCardDeriveProgress(id,0,'准备资产推演')" "$file"
  grep -Fq "overflow:auto!important;" "$file"
  if grep -Fq "_assetCardDeriveProgress" "$file"; then
    echo "unexpected percent derive progress marker in $file" >&2
    return 1
  fi
  if grep -Fq "setInterval(tick,700)" "$file"; then
    echo "unexpected simulated derive progress timer in $file" >&2
    return 1
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

echo "deployed asset-derive-step-progress-20260622230916"
echo "backup: $BACKUP_DIR"
