#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/vip-discount-badge-fix-20260521.tar.gz}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/vip-discount-badge-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验 VIP 折扣徽章标记"
grep -n "vip-discount" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "vip-cta" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "membershipDiscountText" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "discount.replace" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "openAccountPage(isActiveMembership" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "部署完成：VIP 徽章已突出显示会员折扣，非会员会显示开通入口。"
