#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/shortcut-presets-help-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/shortcut-presets-help-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验快捷键预设标记"
grep -n "SHORTCUT_PRESET_KEY" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "shortcutPresetSelect" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "shortcutMatches('runAll'" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "RunningHub" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "ComfyUI" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：快捷键预设模板与实际快捷键逻辑已更新。"
