#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/personal-api-docs-mj-20260614020426.tar.gz}"
WEB_DOCS_DIR="${WEB_DOCS_DIR:-/var/www/ai-admin/docs}"
API_PLATFORM_DOCS_DIR="${API_PLATFORM_DOCS_DIR:-/var/www/ai-admin/ai-admin-platform/docs}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/personal-api-docs-mj-20260614020426-XXXXXX)"
BACKUP_ROOT="${MIRROR_TARGET}/.deploy-backups/personal-api-docs-mj-20260614020426-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/personal-api-docs-mj-20260614020426"
DOC_MAIN="$SRC/docs/personal-api-integration-guide.md"
DOC_INDEX="$SRC/docs/workspace-status.md"

test -f "$DOC_MAIN" || { echo "部署包缺少 docs/personal-api-integration-guide.md" >&2; exit 2; }
test -f "$DOC_INDEX" || { echo "部署包缺少 docs/workspace-status.md" >&2; exit 2; }
grep -Fq "MJ 文生图" "$DOC_MAIN" || { echo "个人 API 文档缺少 MJ 文生图章节" >&2; exit 2; }
grep -Fq "/mj/submit/imagine" "$DOC_MAIN" || { echo "个人 API 文档缺少 MJ 提交接口" >&2; exit 2; }
grep -Fq "personal-api-integration-guide.md" "$DOC_INDEX" || { echo "文档索引未登记个人 API 文档" >&2; exit 2; }

log "backup docs to $BACKUP_ROOT"
run_sudo mkdir -p "$BACKUP_ROOT/docs"
if run_sudo test -f "$WEB_DOCS_DIR/personal-api-integration-guide.md"; then
  run_sudo cp -a "$WEB_DOCS_DIR/personal-api-integration-guide.md" "$BACKUP_ROOT/docs/personal-api-integration-guide.md.web.bak"
fi
if run_sudo test -f "$WEB_DOCS_DIR/workspace-status.md"; then
  run_sudo cp -a "$WEB_DOCS_DIR/workspace-status.md" "$BACKUP_ROOT/docs/workspace-status.md.web.bak"
fi
if run_sudo test -f "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md"; then
  run_sudo cp -a "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md" "$BACKUP_ROOT/docs/personal-api-integration-guide.md.api-platform.bak"
fi
if run_sudo test -f "$API_PLATFORM_DOCS_DIR/workspace-status.md"; then
  run_sudo cp -a "$API_PLATFORM_DOCS_DIR/workspace-status.md" "$BACKUP_ROOT/docs/workspace-status.md.api-platform.bak"
fi
if run_sudo test -f "$MIRROR_TARGET/docs/personal-api-integration-guide.md"; then
  run_sudo cp -a "$MIRROR_TARGET/docs/personal-api-integration-guide.md" "$BACKUP_ROOT/docs/personal-api-integration-guide.md.mirror.bak"
fi
if run_sudo test -f "$MIRROR_TARGET/docs/workspace-status.md"; then
  run_sudo cp -a "$MIRROR_TARGET/docs/workspace-status.md" "$BACKUP_ROOT/docs/workspace-status.md.mirror.bak"
fi

log "install web docs: $WEB_DOCS_DIR"
run_sudo mkdir -p "$WEB_DOCS_DIR"
run_sudo cp -f "$DOC_MAIN" "$WEB_DOCS_DIR/personal-api-integration-guide.md"
run_sudo cp -f "$DOC_INDEX" "$WEB_DOCS_DIR/workspace-status.md"
run_sudo chmod 644 "$WEB_DOCS_DIR/personal-api-integration-guide.md" "$WEB_DOCS_DIR/workspace-status.md" 2>/dev/null || true
run_sudo chown www-data:www-data "$WEB_DOCS_DIR/personal-api-integration-guide.md" "$WEB_DOCS_DIR/workspace-status.md" 2>/dev/null || true

log "install API platform docs: $API_PLATFORM_DOCS_DIR"
run_sudo mkdir -p "$API_PLATFORM_DOCS_DIR"
run_sudo cp -f "$DOC_MAIN" "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md"
run_sudo cp -f "$DOC_INDEX" "$API_PLATFORM_DOCS_DIR/workspace-status.md"
run_sudo chmod 644 "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md" "$API_PLATFORM_DOCS_DIR/workspace-status.md" 2>/dev/null || true
run_sudo chown www-data:www-data "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md" "$API_PLATFORM_DOCS_DIR/workspace-status.md" 2>/dev/null || true

if run_sudo test -d "$MIRROR_TARGET/docs"; then
  log "install mirror docs: $MIRROR_TARGET/docs"
  run_sudo cp -f "$DOC_MAIN" "$MIRROR_TARGET/docs/personal-api-integration-guide.md"
  run_sudo cp -f "$DOC_INDEX" "$MIRROR_TARGET/docs/workspace-status.md"
else
  log "mirror docs skipped, not found: $MIRROR_TARGET/docs"
fi

run_sudo grep -Fq "MJ 文生图" "$WEB_DOCS_DIR/personal-api-integration-guide.md"
run_sudo grep -Fq "/mj/submit/imagine" "$WEB_DOCS_DIR/personal-api-integration-guide.md"
run_sudo grep -Fq "personal-api-integration-guide.md" "$WEB_DOCS_DIR/workspace-status.md"
run_sudo grep -Fq "MJ 文生图" "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md"
run_sudo grep -Fq "/mj/submit/imagine" "$API_PLATFORM_DOCS_DIR/personal-api-integration-guide.md"
run_sudo grep -Fq "personal-api-integration-guide.md" "$API_PLATFORM_DOCS_DIR/workspace-status.md"
if run_sudo test -f "$MIRROR_TARGET/docs/personal-api-integration-guide.md"; then
  run_sudo grep -Fq "MJ 文生图" "$MIRROR_TARGET/docs/personal-api-integration-guide.md"
fi

log "done"
echo "backup: $BACKUP_ROOT"
echo "个人 API 文档: http://124.156.137.236/docs/personal-api-integration-guide.md?v=$STAMP"
