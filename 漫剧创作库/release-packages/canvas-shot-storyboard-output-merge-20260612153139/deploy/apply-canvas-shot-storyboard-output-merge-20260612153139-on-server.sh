#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG="canvas-shot-storyboard-output-merge-20260612153139"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PUBLIC_DIR="/var/www/ai-admin/workbench-web"
MIRROR_DIR="/home/ubuntu/漫剧创作库/tools/workbench-web"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups"
BACKUP_DIR="$BACKUP_ROOT/$PKG-$(date +%Y%m%d%H%M%S)"

echo "[deploy] extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"
PKG_ROOT="$TMP_DIR/$PKG"
PUBLIC_FILE="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_FILE="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"

verify_file() {
  local file="$1"
  grep -Fq "function normalizeShotStoryboardOutputType(value)" "$file"
  grep -Fq "return [['image','分镜图'],['table','分镜表']]" "$file"
  grep -Fq "outputType:'image'" "$file"
  grep -Fq "输出类型：\${shotStoryboardOutputTypeLabel(outputType)}" "$file"
  grep -Fq "先生成分镜表，再用分镜表生成分镜图" "$file"
  grep -Fq "outputType,storyboardOutputType:outputType" "$file"
  grep -Fq "分镜表和分镜图已生成" "$file"
  if grep -Fq "table_image" "$file"; then
    echo "[deploy] stale table_image marker found in $file" >&2
    exit 2
  fi
}

echo "[deploy] verify package markers"
verify_file "$PUBLIC_FILE"
verify_file "$MIRROR_FILE"

mkdir -p "$BACKUP_DIR"
echo "[deploy] backup dir: $BACKUP_DIR"
if [[ -f "$PUBLIC_DIR/image-studio-canvas-next.html" ]]; then
  mkdir -p "$BACKUP_DIR/public-workbench"
  cp -a "$PUBLIC_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-workbench/"
fi
if [[ -f "$MIRROR_DIR/image-studio-canvas-next.html" ]]; then
  mkdir -p "$BACKUP_DIR/tools-workbench"
  cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/tools-workbench/"
fi

echo "[deploy] install public workbench: $PUBLIC_DIR"
mkdir -p "$PUBLIC_DIR"
cp -a "$PUBLIC_FILE" "$PUBLIC_DIR/image-studio-canvas-next.html"
echo "[deploy] installed $PUBLIC_DIR/image-studio-canvas-next.html"

echo "[deploy] install mirror workbench: $MIRROR_DIR"
mkdir -p "$MIRROR_DIR"
cp -a "$MIRROR_FILE" "$MIRROR_DIR/image-studio-canvas-next.html"
echo "[deploy] installed $MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] verify installed markers"
verify_file "$PUBLIC_DIR/image-studio-canvas-next.html"
verify_file "$MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
