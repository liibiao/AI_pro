#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: $0 /tmp/openai-responses-image-size-options-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/openai-responses-image-size-options-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/openai-responses-image-size-options-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/workbench-web" "$BACKUP_DIR/tools/workbench-web"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

HTML="$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html"
if [[ ! -f "$HTML" ]]; then
  echo "部署包缺少 workbench-web/image-studio-canvas-next.html" >&2
  exit 1
fi
grep -q "OPENAI_RESPONSES_IMAGE_RESOLUTIONS=\\['1k','2k','3k','4k'\\]" "$HTML"
grep -q "openAiFlexibleSizeSpec" "$HTML"
if grep -q "OPENAI_RESPONSES_IMAGE_RESOLUTIONS=\\['1k','2k'\\];" "$HTML"; then
  echo "部署包仍包含旧 Responses 分辨率常量，停止覆盖" >&2
  exit 1
fi

echo "==> 备份线上画布到 $BACKUP_DIR"
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [[ -f "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" ]]; then
  cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

echo "==> 覆盖线上画布 HTML"
mkdir -p "$REMOTE_WORKBENCH_ROOT"
cp -a "$HTML" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
if [[ -d "$REMOTE_ROOT/tools/workbench-web" && -f "$DEPLOY_DIR/tools/workbench-web/image-studio-canvas-next.html" ]]; then
  cp -a "$DEPLOY_DIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

echo "==> 校验线上画布"
CHECK_HTML="$DEPLOY_DIR/check-image-studio-canvas-next.html"
curl -sS http://127.0.0.1/image-studio-canvas-next.html -o "$CHECK_HTML"
grep -q "OPENAI_RESPONSES_IMAGE_RESOLUTIONS=\\['1k','2k','3k','4k'\\]" "$CHECK_HTML"
grep -q "openAiFlexibleSizeSpec" "$CHECK_HTML"
if grep -q "OPENAI_RESPONSES_IMAGE_RESOLUTIONS=\\['1k','2k'\\];" "$CHECK_HTML"; then
  echo "线上仍命中旧 Responses 分辨率常量" >&2
  exit 1
fi

echo "部署完成。备份目录: $BACKUP_DIR"
echo "强制刷新访问: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
