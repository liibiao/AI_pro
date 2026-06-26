#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive missing: $ARCHIVE" >&2
  exit 1
fi

STAMP="20260612214540"
PKG="canvas-mj-upscale-and-node-cleanup-${STAMP}"
TMP="/tmp/${PKG}-extract"
WEB_ROOT="/var/www/ai-admin/workbench-web"
REPO_ROOT="/home/ubuntu/漫剧创作库"
BACKUP_DIR="${REPO_ROOT}/.deploy-backups/${PKG}-$(date +%Y%m%d%H%M%S)"

rm -rf "$TMP"
mkdir -p "$TMP"
tar -xzf "$ARCHIVE" -C "$TMP"

PKG_ROOT="$TMP/${PKG}"
SRC_WEB_HTML="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
SRC_REPO_HTML="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SRC_WEB_NODE_DEFS="$PKG_ROOT/workbench-web/canvas-next/node-defs.js"
SRC_WEB_RENDERERS="$PKG_ROOT/workbench-web/canvas-next/renderers.js"
SRC_REPO_NODE_DEFS="$PKG_ROOT/tools/workbench-web/canvas-next/node-defs.js"
SRC_REPO_RENDERERS="$PKG_ROOT/tools/workbench-web/canvas-next/renderers.js"
SRC_SMART_NODE_DEFS="$PKG_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js"
SRC_SMART_RENDERERS="$PKG_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"

for src in "$SRC_WEB_HTML" "$SRC_REPO_HTML" "$SRC_WEB_NODE_DEFS" "$SRC_WEB_RENDERERS" "$SRC_REPO_NODE_DEFS" "$SRC_REPO_RENDERERS" "$SRC_SMART_NODE_DEFS" "$SRC_SMART_RENDERERS"; do
  if [[ ! -f "$src" ]]; then
    echo "[deploy] package file missing: $src" >&2
    exit 1
  fi
done

echo "[deploy] verify package markers"
for marker in \
  "function midjourneyActionCodeLooksSingleImage" \
  "meta?.type==='upscale'||midjourneyActionCodeLooksSingleImage(explicitAction)" \
  "mjSmart:{cat:'generate',name:'智能MJ',icon:'MJ',desc:'自然语言 + Midjourney V7 模型 → 高质量英文提示词 → Image',w:437,hidden:true"; do
  if ! grep -Fq "$marker" "$SRC_WEB_HTML"; then
    echo "[deploy] missing html marker: $marker" >&2
    exit 1
  fi
done
for src in "$SRC_WEB_NODE_DEFS" "$SRC_REPO_NODE_DEFS" "$SRC_SMART_NODE_DEFS"; do
  for marker in \
    "{id:'mjSmart',label:'智能MJ',short:'MJ',desc:'自然语言转 MJ-V7 英文提示词',output:'image',hidden:true}" \
    "generatorHub:{activeMode:'txt2img',panelCollapsed:false,modeValues:modeDefaults()}"; do
    if ! grep -Fq "$marker" "$src"; then
      echo "[deploy] missing node-def marker in $src: $marker" >&2
      exit 1
    fi
  done
done
for src in "$SRC_WEB_RENDERERS" "$SRC_REPO_RENDERERS" "$SRC_SMART_RENDERERS"; do
  for marker in \
    "GENERATOR_MODES.filter(m=>!m.hidden).map" \
    "const modes=GENERATOR_MODES.filter(m=>!m.hidden||m.id===mode);"; do
    if ! grep -Fq "$marker" "$src"; then
      echo "[deploy] missing renderer marker in $src: $marker" >&2
      exit 1
    fi
  done
done

mkdir -p "$BACKUP_DIR"
backup_if_exists() {
  local target="$1"
  local name="$2"
  if [[ -f "$target" ]]; then
    cp -p "$target" "$BACKUP_DIR/$name"
  fi
}

backup_if_exists "$WEB_ROOT/image-studio-canvas-next.html" "image-studio-canvas-next.html.var-www.bak"
backup_if_exists "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html" "image-studio-canvas-next.html.repo.bak"
backup_if_exists "$WEB_ROOT/canvas-next/node-defs.js" "node-defs.js.var-www.bak"
backup_if_exists "$WEB_ROOT/canvas-next/renderers.js" "renderers.js.var-www.bak"
backup_if_exists "$REPO_ROOT/tools/workbench-web/canvas-next/node-defs.js" "node-defs.js.repo-tools.bak"
backup_if_exists "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" "renderers.js.repo-tools.bak"
backup_if_exists "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js" "node-defs.js.repo-smart.bak"
backup_if_exists "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "renderers.js.repo-smart.bak"

mkdir -p "$WEB_ROOT/canvas-next" "$REPO_ROOT/tools/workbench-web/canvas-next" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next"
install -m 0644 "$SRC_WEB_HTML" "$WEB_ROOT/image-studio-canvas-next.html"
install -m 0644 "$SRC_REPO_HTML" "$REPO_ROOT/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$SRC_WEB_NODE_DEFS" "$WEB_ROOT/canvas-next/node-defs.js"
install -m 0644 "$SRC_WEB_RENDERERS" "$WEB_ROOT/canvas-next/renderers.js"
install -m 0644 "$SRC_REPO_NODE_DEFS" "$REPO_ROOT/tools/workbench-web/canvas-next/node-defs.js"
install -m 0644 "$SRC_REPO_RENDERERS" "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js"
install -m 0644 "$SRC_SMART_NODE_DEFS" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js"
install -m 0644 "$SRC_SMART_RENDERERS" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"

echo "[deploy] verify installed markers"
for marker in \
  "function midjourneyActionCodeLooksSingleImage" \
  "meta?.type==='upscale'||midjourneyActionCodeLooksSingleImage(explicitAction)" \
  "mjSmart:{cat:'generate',name:'智能MJ',icon:'MJ',desc:'自然语言 + Midjourney V7 模型 → 高质量英文提示词 → Image',w:437,hidden:true"; do
  if ! grep -Fq "$marker" "$WEB_ROOT/image-studio-canvas-next.html"; then
    echo "[deploy] installed html marker missing: $marker" >&2
    exit 1
  fi
done
for target in "$WEB_ROOT/canvas-next/node-defs.js" "$REPO_ROOT/tools/workbench-web/canvas-next/node-defs.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/node-defs.js"; do
  if ! grep -Fq "{id:'mjSmart',label:'智能MJ',short:'MJ',desc:'自然语言转 MJ-V7 英文提示词',output:'image',hidden:true}" "$target"; then
    echo "[deploy] installed node-def marker missing in $target" >&2
    exit 1
  fi
done
for target in "$WEB_ROOT/canvas-next/renderers.js" "$REPO_ROOT/tools/workbench-web/canvas-next/renderers.js" "$REPO_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"; do
  if ! grep -Fq "GENERATOR_MODES.filter(m=>!m.hidden).map" "$target"; then
    echo "[deploy] installed renderer marker missing in $target" >&2
    exit 1
  fi
done

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=${STAMP}"
