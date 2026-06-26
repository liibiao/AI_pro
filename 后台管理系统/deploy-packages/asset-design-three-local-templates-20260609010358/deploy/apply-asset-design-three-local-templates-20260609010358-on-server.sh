#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/asset-design-three-local-templates-20260609010358.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-$MIRROR_ROOT/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/asset-design-three-local-templates-20260609010358-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/asset-design-three-local-templates-20260609010358-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/asset-design-three-local-templates-20260609010358"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
PREVIEW_DIR="$SRC/workbench-web/assets/template-previews"
ORIGINAL_DIR="$SRC/workbench-web/assets/template-previews-original"
MANIFEST="$ORIGINAL_DIR/manifest.json"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -d "$ORIGINAL_DIR" || { echo "部署包缺少 template-previews-original" >&2; exit 1; }
test -f "$MANIFEST" || { echo "部署包缺少 template-previews-original/manifest.json" >&2; exit 1; }

python3 - "$MANIFEST" <<'PY'
import json
import sys
items = json.load(open(sys.argv[1]))
if len(items) < 25:
    raise SystemExit(f"模板清单不足 25 条，当前 {len(items)} 条")
for item in items[:22]:
    if not str(item.get("cos", "")).startswith("http"):
        raise SystemExit(f"前 22 条 COS 地址异常: {item}")
required = {
    "three_view_face_closeup_brown",
    "cyber_three_view_detail_sheet",
    "ancient_elder_character_sheet",
}
ids = {str(item.get("id", "")) for item in items}
missing = sorted(required - ids)
if missing:
    raise SystemExit(f"缺少新增模板 manifest: {', '.join(missing)}")
PY

grep -q "three_view_face_closeup_brown" "$HTML" || { echo "缺少棕色三视图近景板模板标记" >&2; exit 2; }
grep -q "cyber_three_view_detail_sheet" "$HTML" || { echo "缺少黑红赛博角色设定板模板标记" >&2; exit 2; }
grep -q "ancient_elder_character_sheet" "$HTML" || { echo "缺少古风老者细节设定板模板标记" >&2; exit 2; }
grep -q "asset-template-popover" "$HTML" || { echo "缺少缩略图悬浮放大弹窗标记" >&2; exit 2; }
grep -q "syncAssetTemplatePromptIntoInput" "$HTML" || { echo "缺少资产模板提示词自动粘贴逻辑" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web/assets"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo mkdir -p "$BACKUP/workbench-web/assets/template-previews-original"
for file in manifest.json three_view_face_closeup_brown.jpg cyber_three_view_detail_sheet.jpg ancient_elder_character_sheet.jpg; do
  run_sudo cp -a "$WORKBENCH_DIR/assets/template-previews-original/$file" "$BACKUP/workbench-web/assets/template-previews-original/$file" 2>/dev/null || true
done

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "install preview assets"
run_sudo mkdir -p "$WORKBENCH_DIR/assets/template-previews" "$WORKBENCH_DIR/assets/template-previews-original"
if [ -d "$PREVIEW_DIR" ]; then
  run_sudo cp -f "$PREVIEW_DIR"/* "$WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
fi
for file in manifest.json three_view_face_closeup_brown.jpg cyber_three_view_detail_sheet.jpg ancient_elder_character_sheet.jpg; do
  if [ -f "$ORIGINAL_DIR/$file" ]; then
    run_sudo cp -f "$ORIGINAL_DIR/$file" "$WORKBENCH_DIR/assets/template-previews-original/$file"
  fi
done

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench files"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/assets/template-previews" "$MIRROR_WORKBENCH_DIR/assets/template-previews-original"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  if [ -d "$PREVIEW_DIR" ]; then
    run_sudo cp -f "$PREVIEW_DIR"/* "$MIRROR_WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
  fi
  for file in manifest.json three_view_face_closeup_brown.jpg cyber_three_view_detail_sheet.jpg ancient_elder_character_sheet.jpg; do
    if [ -f "$ORIGINAL_DIR/$file" ]; then
      run_sudo cp -f "$ORIGINAL_DIR/$file" "$MIRROR_WORKBENCH_DIR/assets/template-previews-original/$file" 2>/dev/null || true
    fi
  done
  run_sudo mkdir -p "$MIRROR_ROOT/tools"
  run_sudo cp -f "$SRC/tools/build_asset_design_templates_from_refs.py" "$MIRROR_ROOT/tools/build_asset_design_templates_from_refs.py" 2>/dev/null || true
  run_sudo cp -f "$SRC/tools/package_asset_design_templates_after_refs.sh" "$MIRROR_ROOT/tools/package_asset_design_templates_after_refs.sh" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chown -R www-data:www-data "$WORKBENCH_DIR/assets/template-previews" "$WORKBENCH_DIR/assets/template-previews-original" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
