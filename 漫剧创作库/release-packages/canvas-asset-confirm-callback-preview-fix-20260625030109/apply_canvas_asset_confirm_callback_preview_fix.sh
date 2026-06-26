#!/usr/bin/env bash
set -euo pipefail
ARCHIVE="${1:?archive path required}"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC="$TMP_DIR/payload"
ROOTS=(
  "/var/www/workbench"
  "/var/www/canvas"
  "/opt/workbench"
  "/opt/canvas"
  "/home/ubuntu/漫剧创作库"
  "/home/ubuntu/AI_pro/漫剧创作库"
)
TARGETS=()
for root in "${ROOTS[@]}"; do
  if [[ -d "$root/tools/workbench-web" ]]; then
    TARGETS+=("$root/tools/workbench-web/image-studio-canvas-next.html")
  fi
  if [[ -d "$root/workbench-web" ]]; then
    TARGETS+=("$root/workbench-web/image-studio-canvas-next.html")
  fi
  if [[ -f "$root/image-studio-canvas-next.html" ]]; then
    TARGETS+=("$root/image-studio-canvas-next.html")
  fi
  if [[ -d "$root" && -f "$root/tools/workbench-web/image-studio-canvas-next.html" ]]; then
    TARGETS+=("$root/tools/workbench-web/image-studio-canvas-next.html")
  fi
done
if [[ -d /var/www/html ]]; then
  while IFS= read -r file; do TARGETS+=("$file"); done < <(find /var/www/html -maxdepth 4 -type f -name image-studio-canvas-next.html 2>/dev/null)
fi
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "No image-studio-canvas-next.html target found" >&2
  exit 1
fi
mapfile -t UNIQUE_TARGETS < <(printf '%s\n' "${TARGETS[@]}" | awk '!seen[$0]++')
for target in "${UNIQUE_TARGETS[@]}"; do
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  if [[ "$target" == *"tools/workbench-web"* ]]; then
    install -m 0644 "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$target"
  else
    install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$target"
  fi
  grep -q "_assetConfirmPreviewOnly" "$target"
  grep -q "assetConfirmDeliverGeneratedEntry" "$target"
  grep -q "assetConfirmCardHasStrictRecoveryIdentity" "$target"
  grep -q "registerAssetConfirmResultCallback" "$target"
  grep -q "MODEL_CONFIG_STATE" "$target"
  if grep -q "newapi" "$target"; then
    echo "Unexpected newapi marker in $target" >&2
    exit 1
  fi
  echo "Updated $target"
done
