#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR="$ROOT/template-reference-input"
PKG_BASE="/Users/billy/Documents/AI_pro/后台管理系统/deploy-packages"

count_refs(){
  find "$INPUT_DIR" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l | tr -d ' '
}

COUNT="$(count_refs)"
if [ "$COUNT" -lt 14 ]; then
  echo "需要至少 14 张参考图，当前 $COUNT 张：$INPUT_DIR" >&2
  echo "请按图2从左到右、从上到下顺序命名，例如 01.png ... 14.png" >&2
  exit 2
fi

cd "$ROOT"
python3 tools/build_asset_design_templates_from_refs.py >/tmp/asset-design-template-cos-manifest.json

MANIFEST="$ROOT/tools/workbench-web/assets/template-previews-original/manifest.json"
python3 - "$MANIFEST" <<'PY'
import json
import sys
items = json.load(open(sys.argv[1]))
if len(items) < 14:
    raise SystemExit(f"COS 映射不足 14 条，当前 {len(items)} 条")
for item in items[:14]:
    if not item.get("cos", "").startswith("http"):
        raise SystemExit(f"COS 地址异常: {item}")
PY

STAMP="$(date +%Y%m%d%H%M%S)"
PKG_NAME="asset-design-template-cos-final-$STAMP"
PKG_ROOT="$PKG_BASE/$PKG_NAME"

rm -rf "$PKG_ROOT"
mkdir -p "$PKG_ROOT/workbench-web/assets" "$PKG_ROOT/tools" "$PKG_ROOT/deploy"
cp -f "$ROOT/tools/workbench-web/image-studio-canvas-next.html" "$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
cp -R "$ROOT/tools/workbench-web/assets/template-previews" "$PKG_ROOT/workbench-web/assets/template-previews"
cp -R "$ROOT/tools/workbench-web/assets/template-previews-original" "$PKG_ROOT/workbench-web/assets/template-previews-original"
cp -f "$ROOT/tools/build_asset_design_templates_from_refs.py" "$PKG_ROOT/tools/build_asset_design_templates_from_refs.py"

cat > "$PKG_ROOT/README.md" <<EOF
# 资产设计模板最终部署包

本包已完成 14 张参考图到 COS 的映射，并写入新画布资产设计节点。

部署包：/tmp/$PKG_NAME.tar.gz

部署脚本：
deploy/apply-$PKG_NAME-on-server.sh
EOF

cat > "$PKG_ROOT/deploy/apply-$PKG_NAME-on-server.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

PKG="\${1:-/tmp/$PKG_NAME.tar.gz}"
WORKBENCH_DIR="\${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="\${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="\$(date +%Y%m%d%H%M%S)"
WORK="\$(mktemp -d /tmp/$PKG_NAME-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/$PKG_NAME-\$STAMP"

log(){ printf '[deploy] %s\\n' "\$*"; }
run_sudo(){ if [ "\$(id -u)" -eq 0 ]; then "\$@"; else sudo "\$@"; fi; }

trap 'rm -rf "\$WORK"' EXIT

test -f "\$PKG" || { echo "缺少部署包: \$PKG" >&2; exit 1; }
run_sudo test -d "\$WORKBENCH_DIR" || { echo "画布目录不存在: \$WORKBENCH_DIR" >&2; exit 1; }

log "extract package: \$PKG"
tar -xzf "\$PKG" -C "\$WORK"
SRC="\$WORK/$PKG_NAME"
HTML="\$SRC/workbench-web/image-studio-canvas-next.html"
MANIFEST="\$SRC/workbench-web/assets/template-previews-original/manifest.json"

test -f "\$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }
test -f "\$MANIFEST" || { echo "未检测到 14 张参考图 COS 映射 manifest.json，拒绝部署占位缩略图" >&2; exit 2; }

MANIFEST_COUNT="\$(python3 - "\$MANIFEST" <<'PY'
import json, sys
print(len(json.load(open(sys.argv[1]))))
PY
)"
test "\$MANIFEST_COUNT" -ge 14 || { echo "COS 映射不足 14 条，当前 \$MANIFEST_COUNT 条，拒绝部署" >&2; exit 2; }

grep -q "mixed_closeup_blueprint" "\$HTML" || { echo "缺少混合五官蓝图板模板标记" >&2; exit 2; }
grep -q "soft_light_poster_archive" "\$HTML" || { echo "缺少柔光海报档案板模板标记" >&2; exit 2; }
grep -q "asset-template-popover" "\$HTML" || { echo "缺少缩略图悬浮放大弹窗标记" >&2; exit 2; }
if grep -q "const ASSET_TEMPLATE_INLINE_PREVIEWS=" "\$HTML"; then
  echo "检测到内联占位缩略图，拒绝部署" >&2
  exit 2
fi

log "backup: \$BACKUP"
run_sudo mkdir -p "\$BACKUP/workbench-web/assets"
run_sudo cp -a "\$WORKBENCH_DIR/image-studio-canvas-next.html" "\$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "\$WORKBENCH_DIR/assets/template-previews" "\$BACKUP/workbench-web/assets/template-previews" 2>/dev/null || true
run_sudo cp -a "\$WORKBENCH_DIR/assets/template-previews-original" "\$BACKUP/workbench-web/assets/template-previews-original" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "\$HTML" "\$WORKBENCH_DIR/image-studio-canvas-next.html"

log "install preview assets"
run_sudo mkdir -p "\$WORKBENCH_DIR/assets/template-previews" "\$WORKBENCH_DIR/assets/template-previews-original"
run_sudo cp -f "\$SRC"/workbench-web/assets/template-previews/* "\$WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
run_sudo cp -f "\$SRC"/workbench-web/assets/template-previews-original/* "\$WORKBENCH_DIR/assets/template-previews-original/" 2>/dev/null || true

if [ -d "\$(dirname "\$MIRROR_WORKBENCH_DIR")" ]; then
  log "install mirror workbench files"
  run_sudo mkdir -p "\$MIRROR_WORKBENCH_DIR/assets/template-previews" "\$MIRROR_WORKBENCH_DIR/assets/template-previews-original"
  run_sudo cp -f "\$HTML" "\$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
  run_sudo cp -f "\$SRC"/workbench-web/assets/template-previews/* "\$MIRROR_WORKBENCH_DIR/assets/template-previews/" 2>/dev/null || true
  run_sudo cp -f "\$SRC"/workbench-web/assets/template-previews-original/* "\$MIRROR_WORKBENCH_DIR/assets/template-previews-original/" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "\$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chown -R www-data:www-data "\$WORKBENCH_DIR/assets/template-previews" "\$WORKBENCH_DIR/assets/template-previews-original" 2>/dev/null || true
run_sudo chmod 644 "\$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "done"
echo "backup: \$BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=\$STAMP"
EOF

chmod +x "$PKG_ROOT/deploy/apply-$PKG_NAME-on-server.sh"
xattr -cr "$PKG_ROOT" 2>/dev/null || true
COPYFILE_DISABLE=1 tar --disable-copyfile --no-xattrs -czf "/tmp/$PKG_NAME.tar.gz" -C "$PKG_BASE" "$PKG_NAME"

echo "/tmp/$PKG_NAME.tar.gz"
echo "$PKG_ROOT"
