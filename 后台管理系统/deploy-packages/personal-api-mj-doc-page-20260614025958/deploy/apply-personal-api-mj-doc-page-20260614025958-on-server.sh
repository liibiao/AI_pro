#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/personal-api-mj-doc-page-20260614025958.tar.gz}"
DOCS_DIR="${DOCS_DIR:-/var/www/ai-admin/ai-admin-platform/docs}"
LEGACY_DOCS_DIR="${LEGACY_DOCS_DIR:-/var/www/ai-admin/docs}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/personal-api-mj-doc-page-20260614025958-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/personal-api-mj-doc-page-20260614025958-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/personal-api-mj-doc-page-20260614025958"
HTML="$SRC/docs/customer-generation-api.html"

test -f "$HTML" || { echo "部署包缺少 docs/customer-generation-api.html" >&2; exit 2; }
grep -Fq "midjourney_imagine" "$HTML" || { echo "内置页缺少 MJ channelKey" >&2; exit 2; }
grep -Fq "canvas-midjourney-imagine" "$HTML" || { echo "内置页缺少 MJ modelId" >&2; exit 2; }
grep -Fq "MJ 文生图 JSON" "$HTML" || { echo "内置页缺少 MJ 文生图 JSON 示例" >&2; exit 2; }
grep -Fq "mjPromptImageUrls" "$HTML" || { echo "内置页缺少 MJ 参考图字段" >&2; exit 2; }

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/docs"
if run_sudo test -f "$DOCS_DIR/customer-generation-api.html"; then
  run_sudo cp -a "$DOCS_DIR/customer-generation-api.html" "$BACKUP/docs/customer-generation-api.html.api-platform.bak"
fi
if run_sudo test -f "$LEGACY_DOCS_DIR/customer-generation-api.html"; then
  run_sudo cp -a "$LEGACY_DOCS_DIR/customer-generation-api.html" "$BACKUP/docs/customer-generation-api.html.legacy.bak"
fi

log "install API platform docs: $DOCS_DIR"
run_sudo mkdir -p "$DOCS_DIR"
run_sudo cp -f "$HTML" "$DOCS_DIR/customer-generation-api.html"
run_sudo chmod 644 "$DOCS_DIR/customer-generation-api.html" 2>/dev/null || true
run_sudo chown www-data:www-data "$DOCS_DIR/customer-generation-api.html" 2>/dev/null || true

if run_sudo test -d "$LEGACY_DOCS_DIR"; then
  log "install legacy docs copy: $LEGACY_DOCS_DIR"
  run_sudo cp -f "$HTML" "$LEGACY_DOCS_DIR/customer-generation-api.html"
  run_sudo chmod 644 "$LEGACY_DOCS_DIR/customer-generation-api.html" 2>/dev/null || true
  run_sudo chown www-data:www-data "$LEGACY_DOCS_DIR/customer-generation-api.html" 2>/dev/null || true
fi

run_sudo grep -Fq "midjourney_imagine" "$DOCS_DIR/customer-generation-api.html"
run_sudo grep -Fq "canvas-midjourney-imagine" "$DOCS_DIR/customer-generation-api.html"
run_sudo grep -Fq "MJ 文生图 JSON" "$DOCS_DIR/customer-generation-api.html"
run_sudo grep -Fq "mjPromptImageUrls" "$DOCS_DIR/customer-generation-api.html"

log "done"
echo "backup: $BACKUP"
echo "内置个人 API 页面: http://124.156.137.236/docs/customer-generation-api.html?v=$STAMP"
