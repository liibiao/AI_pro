#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/asset-design-template-cos-builder-20260601012610.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/asset-design-template-cos-builder-20260601012610-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/asset-design-template-cos-builder-20260601012610-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/asset-design-template-cos-builder-20260601012610"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"
MANIFEST="$SRC/workbench-web/assets/template-previews-original/manifest.json"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -d "$SRC/workbench-web/assets/template-previews" || { echo "部署包缺少 template-previews 资源目录" >&2; exit 1; }
test -f "$MANIFEST" || { echo "未检测到 14 张参考图 COS 映射 manifest.json，拒绝部署占位缩略图" >&2; exit 2; }

MANIFEST_COUNT="$(python3 - "$MANIFEST" <<'PY'
import json, sys
print(len(json.load(open(sys.argv[1]))))
PY
)"
test "$MANIFEST_COUNT" -ge 14 || { echo "COS 映射不足 14 条，当前 $MANIFEST_COUNT 条，拒绝部署" >&2; exit 2; }

grep -q "mixed_closeup_blueprint" "$HTML" || { echo "缺少混合五官蓝图板模板标记" >&2; exit 2; }
grep -q "soft_light_poster_archive" "$HTML" || { echo "缺少柔光海报档案板模板标记" >&2; exit 2; }
grep -q "asset-template-popover" "$HTML" || { echo "缺少缩略图悬浮放大弹窗标记" >&2; exit 2; }
if grep -q "ASSET_TEMPLATE_INLINE_PREVIEWS" "$HTML"; then
  echo "检测到内联占位缩略图，说明还没有完成真实 COS 缩略图写入，拒绝部署" >&2
  exit 2
fi

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web/assets"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/assets/template-previews" "$BACKUP/workbench-web/assets/template-previews" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/assets/template-previews-original" "$BACKUP/workbench-web/assets/template-previews-original" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "install local fallback preview assets"
run_sudo mkdir -p "$WORKBENCH_DIR/assets/template-previews" "$WORKBENCH_DIR/assets/template-previews-original"
run_sudo cp -f "$SRC"/workbench-web/assets/template-previews/* "$WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
run_sudo cp -f "$SRC"/workbench-web/assets/template-previews-original/* "$WORKBENCH_DIR/assets/template-previews-original/" 2>/dev/null || true

if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench files"
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR/assets/template-previews" "$MIRROR_WORKBENCH_DIR/assets/template-previews-original"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  run_sudo cp -f "$SRC"/workbench-web/assets/template-previews/* "$MIRROR_WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
  run_sudo cp -f "$SRC"/workbench-web/assets/template-previews-original/* "$MIRROR_WORKBENCH_DIR/assets/template-previews-original/" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chown -R www-data:www-data "$WORKBENCH_DIR/assets/template-previews" "$WORKBENCH_DIR/assets/template-previews-original" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
