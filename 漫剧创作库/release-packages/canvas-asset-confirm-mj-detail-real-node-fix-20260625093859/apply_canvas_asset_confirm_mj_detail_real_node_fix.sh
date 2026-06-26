#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC_TOOLS="$TMP_DIR/payload/tools/workbench-web/image-studio-canvas-next.html"
SRC_WEB="$TMP_DIR/payload/workbench-web/image-studio-canvas-next.html"

TARGETS=(
  "/var/www/ai-admin/image-studio-canvas-next.html:$SRC_WEB"
  "/var/www/ai-admin/workbench-web/image-studio-canvas-next.html:$SRC_WEB"
  "/var/www/ai-admin/tools/workbench-web/image-studio-canvas-next.html:$SRC_TOOLS"
  "/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html:$SRC_TOOLS"
)

updated=0
for pair in "${TARGETS[@]}"; do
  target="${pair%%:*}"
  src="${pair#*:}"
  [[ -f "$src" ]] || { echo "Missing packaged source $src" >&2; exit 1; }
  [[ -d "$(dirname "$target")" ]] || continue
  install -m 0644 "$src" "$target"
  grep -q "n._assetConfirmParentId" "$target"
  grep -q "viewerNode=S.nodes" "$target"
  grep -q "_assetConfirmPreviewOnly" "$target"
  grep -q "assetConfirmDeliverGeneratedEntry" "$target"
  grep -q "MODEL_CONFIG_STATE" "$target"
  if grep -q "newapi" "$target"; then
    echo "Unexpected newapi marker in $target" >&2
    exit 1
  fi
  echo "Updated $target"
  updated=$((updated+1))
done

if [[ "$updated" -eq 0 ]]; then
  echo "No target paths updated" >&2
  exit 1
fi
