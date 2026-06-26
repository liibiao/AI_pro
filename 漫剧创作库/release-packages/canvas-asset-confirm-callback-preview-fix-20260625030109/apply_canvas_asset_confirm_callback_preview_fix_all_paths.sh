#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
TMP_DIR="$(mktemp -d)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC="$TMP_DIR/payload/tools/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$SRC" ]]; then
  echo "Missing packaged canvas html: $SRC" >&2
  exit 1
fi

mapfile -t TARGETS < <(
  find / \
    \( -path /proc -o -path /sys -o -path /dev -o -path /run -o -path /tmp -o -path /var/tmp \) -prune \
    -o -type f -name image-studio-canvas-next.html -print 2>/dev/null \
  | awk '!seen[$0]++'
)

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "No image-studio-canvas-next.html target found" >&2
  exit 1
fi

for target in "${TARGETS[@]}"; do
  install -m 0644 "$SRC" "$target"
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
