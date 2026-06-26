#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 2
fi

PKG="prop-basic-three-view-template-20260619121137"
WORKDIR="$(mktemp -d "/tmp/${PKG}.XXXXXX")"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-$(date +%Y%m%d%H%M%S)"
PUBLIC_ROOT="/var/www/ai-admin/workbench-web"
MIRROR_ROOT="/home/ubuntu/漫剧创作库/tools/workbench-web"

trap 'rm -rf "$WORKDIR"' EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"
SRC_ROOT="$WORKDIR/$PKG"
HTML="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
TOOLS_HTML="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"
MANIFEST="$SRC_ROOT/workbench-web/assets/template-previews-original/manifest.json"
PREVIEW="$SRC_ROOT/workbench-web/assets/template-previews/prop-basic-three-view-sheet.png"
ORIGINAL="$SRC_ROOT/workbench-web/assets/template-previews-original/prop_basic_three_view_sheet.png"

for required in "$HTML" "$TOOLS_HTML" "$MANIFEST" "$PREVIEW" "$ORIGINAL"; do
  if [[ ! -f "$required" ]]; then
    echo "[deploy] missing package file: $required" >&2
    exit 3
  fi
done

for marker in \
  "prop_basic_three_view_sheet" \
  "道具普通三视图模板" \
  'size:"16:9"' \
  "mjb-reference/20260619/c4cefe3cc85d420e9a3d8d6541bfaa4e.png" \
  "无文字、无遮挡、无边框" \
  "if(value==='prop')return 'prop_basic_three_view_sheet'" \
  "if(id==='prop_basic_three_view_sheet'||id==='prop_turnaround')return ['prop']"
do
  if ! grep -Fq "$marker" "$HTML"; then
    echo "[deploy] marker missing in html: $marker" >&2
    exit 4
  fi
done

python3 - "$MANIFEST" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
items = [item for item in manifest if item.get('id') == 'prop_basic_three_view_sheet']
if len(items) != 1:
    raise SystemExit('prop_basic_three_view_sheet manifest entry missing or duplicated')
item = items[0]
url = 'https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260619/c4cefe3cc85d420e9a3d8d6541bfaa4e.png'
if item.get('cos') != url or item.get('key') != 'mjb-reference/20260619/c4cefe3cc85d420e9a3d8d6541bfaa4e.png':
    raise SystemExit('prop template COS manifest mismatch')
print('[deploy] manifest ok')
PY

mkdir -p "$BACKUP_ROOT/public/assets/template-previews" "$BACKUP_ROOT/public/assets/template-previews-original"

backup_one(){
  local src="$1"
  local dest="$2"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
  fi
}

install_one(){
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ -f "$dest" ]]; then
    backup_one "$dest" "$BACKUP_ROOT/$dest"
  fi
  install -m 0644 "$src" "$dest"
  echo "[deploy] installed $dest"
}

install_one "$HTML" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install_one "$PREVIEW" "$PUBLIC_ROOT/assets/template-previews/prop-basic-three-view-sheet.png"
install_one "$ORIGINAL" "$PUBLIC_ROOT/assets/template-previews-original/prop_basic_three_view_sheet.png"
install_one "$MANIFEST" "$PUBLIC_ROOT/assets/template-previews-original/manifest.json"

if [[ -d "$MIRROR_ROOT" ]]; then
  install_one "$TOOLS_HTML" "$MIRROR_ROOT/image-studio-canvas-next.html"
  install_one "$SRC_ROOT/tools/workbench-web/assets/template-previews/prop-basic-three-view-sheet.png" "$MIRROR_ROOT/assets/template-previews/prop-basic-three-view-sheet.png"
  install_one "$SRC_ROOT/tools/workbench-web/assets/template-previews-original/prop_basic_three_view_sheet.png" "$MIRROR_ROOT/assets/template-previews-original/prop_basic_three_view_sheet.png"
  install_one "$SRC_ROOT/tools/workbench-web/assets/template-previews-original/manifest.json" "$MIRROR_ROOT/assets/template-previews-original/manifest.json"
fi

if [[ -d "/home/ubuntu/漫剧创作库/workbench-web" ]]; then
  install_one "$HTML" "/home/ubuntu/漫剧创作库/workbench-web/image-studio-canvas-next.html"
fi

echo "[deploy] done"
echo "backup: $BACKUP_ROOT"
