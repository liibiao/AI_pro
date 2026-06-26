#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/seedance-full-1080-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/seedance-full-1080-fix-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT

mkdir -p "$WORK_ROOT" "$BACKUP_ROOT"
tar -xzf "$ARCHIVE" -C "$WORK_ROOT"

backup_file() {
  local rel="$1"
  local src="$APP_ROOT/$rel"
  if [[ -f "$src" ]]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
    cp "$src" "$BACKUP_ROOT/$rel"
  fi
}

install_file() {
  local rel="$1"
  local src="$WORK_ROOT/stage/$rel"
  local dst="$APP_ROOT/$rel"
  if [[ ! -f "$src" ]]; then
    echo "missing package file: $rel" >&2
    exit 1
  fi
  backup_file "$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

install_file "api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/src/modules/generation/routes.ts"
install_file "api-server/src/modules/models/routes.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/dist/modules/generation/routes.js"
install_file "api-server/dist/modules/models/routes.js"
install_file "tools/workbench-web/image-studio-canvas-next.html"
install_file "workbench-web/image-studio-canvas-next.html"

cd "$APP_ROOT/api-server"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const model = await prisma.aiModel.findUnique({ where: { id: 'canvas-sz-seedance2' } });
  if (!model) {
    console.log('[seedance-full] model canvas-sz-seedance2 not found, skip db patch');
  } else {
    const protocol = model.protocol && typeof model.protocol === 'object' && !Array.isArray(model.protocol)
      ? { ...model.protocol }
      : {};
    const nextProtocol = {
      ...protocol,
      adapter: 'seedance-full',
      method: protocol.method || 'async-poll',
      endpointPath: '/seedance-full/generate',
      endpoint_path: '/seedance-full/generate',
      statusEndpointPath: '/seedance-full/task/{taskId}',
      status_endpoint_path: '/seedance-full/task/{taskId}',
      requestSchema: protocol.requestSchema || 'seedance-full-json',
      modelByResolution: {
        ...(protocol.modelByResolution && typeof protocol.modelByResolution === 'object' ? protocol.modelByResolution : {}),
        '720p': 'sz-seedance2',
        '1080p': 'sz-seedance2-1080p',
      },
    };
    await prisma.aiModel.update({
      where: { id: model.id },
      data: {
        adapter: 'seedance-full',
        endpointPath: '/seedance-full/generate',
        statusEndpointPath: '/seedance-full/task/{taskId}',
        protocol: nextProtocol,
      },
    });
    console.log('[seedance-full] patched canvas-sz-seedance2 adapter/endpoints/modelByResolution');
  }
} finally {
  await prisma.$disconnect();
}
NODE

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env || pm2 restart all --update-env
fi

echo "seedance-full 1080 fix installed"
echo "backup: $BACKUP_ROOT"
