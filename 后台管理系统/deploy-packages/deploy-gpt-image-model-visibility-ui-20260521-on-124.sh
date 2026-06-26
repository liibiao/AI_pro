#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-model-visibility-ui-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

log(){ printf '==> %s\n' "$*"; }
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$PKG" ] || fail "找不到部署包：$PKG"
[ -d "$BACKEND_DIR/admin-web" ] || fail "找不到后台管理前端：$BACKEND_DIR/admin-web"
[ -d "$CANVAS_DIR/tools/workbench-web" ] || fail "找不到画布目录：$CANVAS_DIR/tools/workbench-web"

WORK="$(mktemp -d /tmp/gpt-image-model-visibility-ui-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

log "解压部署包"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORK"
find "$WORK" -name '._*' -print -delete || true

log "覆盖后台任务详情 UI"
rsync -a "$WORK/backend/" "$BACKEND_DIR/"

log "覆盖画布源码与线上 workbench HTML"
install -m 0644 "$WORK/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$ONLINE_WORKBENCH_DIR" ]; then
  install -m 0644 "$WORK/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
fi

log "编译后台管理前端"
cd "$BACKEND_DIR/admin-web"
npm run build

log "校验 GPT-Image-2 模型可见性 UI"
grep -n "GPT-Image-2 模型确认" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "本单透传外层模型" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "generationGptImage2Models" "$BACKEND_DIR/admin-web/src/main.tsx"

log "部署完成：画布参数预览显示生图模型/外层模型，后台任务详情显示本单实际透传外层模型。"
