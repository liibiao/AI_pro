#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-/tmp/admin-combined-fixes-202605280946.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
WORKBENCH_TARGET="${WORKBENCH_TARGET:-/var/www/ai-admin/workbench-web}"
WORKBENCH_MIRROR="${WORKBENCH_MIRROR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/admin-combined-fixes-202605280946-XXXXXX)"
log(){ printf '==> %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_sudo(){ if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then pm2 "$@"; elif command -v sudo >/dev/null 2>&1; then sudo -u "$PM2_USER" pm2 "$@"; else return 0; fi; }
trap 'rm -rf "$WORK"' EXIT
test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$APP_DIR/admin-web" || { echo "后台目录不正确: $APP_DIR" >&2; exit 1; }
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/admin-combined-fixes-202605280946"
test -d "$SRC/admin-web/dist" || { echo "部署包缺少 admin-web/dist" >&2; exit 1; }
test -d "$SRC/api-server/dist" || { echo "部署包缺少 api-server/dist" >&2; exit 1; }
test -d "$SRC/workbench-web" || { echo "部署包缺少 workbench-web" >&2; exit 1; }
BACKUP_ROOT="/var/www/ai-admin/backups/admin-combined-fixes-202605280946-$STAMP"
log "备份到 $BACKUP_ROOT"
run_sudo mkdir -p "$BACKUP_ROOT" "$APP_DIR/docs" "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist" "$APP_DIR/api-server/src" "$APP_DIR/api-server/dist" /var/www/ai-admin/backups
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_ROOT/main.tsx.bak" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/src/api.ts" "$BACKUP_ROOT/admin-api.ts.bak" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src" "$BACKUP_ROOT/api-server-src" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist" "$BACKUP_ROOT/api-server-dist" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist" "$BACKUP_ROOT/admin-web-dist" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/docs" "$BACKUP_ROOT/docs" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_TARGET" "$BACKUP_ROOT/workbench-web" 2>/dev/null || true
log "部署后端修复"
run_sudo rsync -a "$SRC/api-server/src/" "$APP_DIR/api-server/src/"
run_sudo rsync -a --delete "$SRC/api-server/dist/" "$APP_DIR/api-server/dist/"
log "部署 API 文档与管理后台前端"
run_sudo cp -f "$SRC/admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
run_sudo cp -f "$SRC/admin-web/src/api.ts" "$APP_DIR/admin-web/src/api.ts"
run_sudo rm -rf "$APP_DIR/admin-web/dist/assets"
run_sudo cp -a "$SRC/admin-web/dist/." "$APP_DIR/admin-web/dist/"
run_sudo cp -f "$SRC/docs/customer-generation-api.md" "$APP_DIR/docs/customer-generation-api.md"
run_sudo cp -f "$SRC/docs/customer-generation-api.html" "$APP_DIR/docs/customer-generation-api.html"
run_sudo cp -f "$SRC/docs/enterprise-generation-api.md" "$APP_DIR/docs/enterprise-generation-api.md"
run_sudo cp -f "$SRC/docs/enterprise-generation-api.html" "$APP_DIR/docs/enterprise-generation-api.html"
log "部署工作台画布修复"
run_sudo mkdir -p "$(dirname "$WORKBENCH_TARGET")"
run_sudo rm -rf "$WORKBENCH_TARGET"
run_sudo cp -a "$SRC/workbench-web" "$WORKBENCH_TARGET"
if run_sudo test -d "$(dirname "$WORKBENCH_MIRROR")"; then run_sudo rm -rf "$WORKBENCH_MIRROR"; run_sudo cp -a "$WORKBENCH_TARGET" "$WORKBENCH_MIRROR"; fi
run_sudo chown -R www-data:www-data "$WORKBENCH_TARGET" 2>/dev/null || true
run_sudo find "$WORKBENCH_TARGET" -type d -exec chmod 755 {} \; 2>/dev/null || true
run_sudo find "$WORKBENCH_TARGET" -type f -exec chmod 644 {} \; 2>/dev/null || true
log "重启后台 PM2"
pm2_sudo restart "$PM2_APP" --update-env || pm2_sudo restart all --update-env || true
pm2_sudo save || true
log "本机文件标记校验"
grep -q "enterprise-generation-api.html" "$APP_DIR/admin-web/src/main.tsx"
grep -q "clientType: mode === 'enterprise' ? undefined : 'ADMIN_WEB'" "$APP_DIR/admin-web/src/main.tsx"
grep -q "isOpenApiPath" "$APP_DIR/admin-web/src/api.ts"
grep -q "clientType" "$APP_DIR/api-server/src/security.ts"
grep -q "clientType === 'CANVAS'" "$APP_DIR/api-server/src/middleware.ts"
grep -q "clientType: z.enum" "$APP_DIR/api-server/src/modules/auth/routes.ts"
grep -q "isStoryboardGenerationTask" "$APP_DIR/api-server/src/modules/generation/routes.ts"
grep -q "normalizeVideoDurationCapabilities" "$APP_DIR/api-server/src/modules/models/routes.ts"
grep -q "resolveCompatImageMode" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
grep -q "clientType:'CANVAS'" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "openApiDocs('enterprise')" "$APP_DIR/admin-web/src/main.tsx"
grep -q "AI 智能体可直接调试版" "$APP_DIR/docs/customer-generation-api.html"
grep -q "/api/open/personal/generation/tasks" "$APP_DIR/docs/customer-generation-api.html"
grep -q "canvas_gpt-image-2-pro" "$APP_DIR/docs/customer-generation-api.html"
grep -q "canvas_sora-v3-pro" "$APP_DIR/docs/customer-generation-api.html"
grep -q "/api/personal-api-tokens" "$APP_DIR/docs/customer-generation-api.html"
grep -q "创建和复制企业 API Token" "$APP_DIR/docs/enterprise-generation-api.html"
grep -q "canvas-sora-v3-pro" "$APP_DIR/docs/enterprise-generation-api.html"
grep -q "img2video" "$APP_DIR/docs/customer-generation-api.html"
grep -q "assetCategory:'panorama'" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "openPersonalApiDocsModal" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "画布文档快捷创建 API Key" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "/api/personal-api-tokens" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "overflow-x:auto" "$WORKBENCH_TARGET/canvas-next/tapnow-rewrite.css"
grep -q "width:max-content" "$WORKBENCH_TARGET/canvas-next/tapnow-rewrite.css"
grep -q "flex:0 0 auto" "$WORKBENCH_TARGET/canvas-next/tapnow-rewrite.css"
grep -q "全景图已导入 720 查看节点" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "cancelRunNode" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "视频生成等待超时" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "生成失败，可修改提示词后重新生成" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "textPromptAgent" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "assetDesign" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "文本提示词节点" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "资产设计节点" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "/api/workbench/text-agent/run" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "/api/workbench/asset-design/run" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "参考图上传接口" "$APP_DIR/docs/customer-generation-api.html"
grep -q "/v1/files" "$APP_DIR/docs/customer-generation-api.html"
grep -q "参考图上传接口" "$APP_DIR/docs/enterprise-generation-api.html"
grep -q "/v1/files" "$APP_DIR/docs/enterprise-generation-api.html"
grep -q "vn2-ref-token-media" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "createAudioReferenceNodeFromVideo" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
grep -q "finishConnectByNode(n.id);cleanupTempConnections();return;}quickDownstream" "$WORKBENCH_TARGET/image-studio-canvas-next.html"
log "部署完成"
echo "backup: $BACKUP_ROOT"
