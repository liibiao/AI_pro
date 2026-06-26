#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/seedance-full-endpoint-hardening-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/seedance-full-endpoint-hardening-$(date +%Y%m%d%H%M%S)"

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
install_file "api-server/dist/modules/generation/adapters/registry.js"

cd "$APP_ROOT/api-server"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const providerId = 'canvas-provider-seedance-full';
  const modelId = 'canvas-sz-seedance2';
  const model = await prisma.aiModel.findUnique({ where: { id: modelId } });
  if (!model) {
    console.log(`[seedance-full-endpoint] model ${modelId} not found, skip db patch`);
  } else {
    const capabilities = model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities) ? { ...model.capabilities } : {};
    const protocol = model.protocol && typeof model.protocol === 'object' && !Array.isArray(model.protocol) ? { ...model.protocol } : {};
    await prisma.$transaction([
      prisma.upstreamProvider.update({
        where: { id: providerId },
        data: {
          status: 'ACTIVE',
          endpointPath: '/seedance-full/generate',
          statusEndpointPath: '/seedance-full/task/{taskId}',
        },
      }),
      prisma.aiModel.update({
        where: { id: modelId },
        data: {
          status: 'ACTIVE',
          adapter: 'seedance-full',
          endpointPath: '/seedance-full/generate',
          statusEndpointPath: '/seedance-full/task/{taskId}',
          capabilities: {
            ...capabilities,
            resolutions: ['720p', '1080p'],
            defaultResolution: capabilities.defaultResolution || '720p',
          },
          protocol: {
            ...protocol,
            adapter: 'seedance-full',
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
          },
        },
      }),
    ]);
    console.log('[seedance-full-endpoint] confirmed seedance-full endpoints and model mapping');
  }
} finally {
  await prisma.$disconnect();
}
NODE

if command -v pm2 >/dev/null 2>&1; then
  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    sudo -u "$SUDO_USER" env HOME="$(eval echo "~$SUDO_USER")" pm2 restart ai-admin-api --update-env || true
  else
    pm2 restart ai-admin-api --update-env || true
  fi
fi

echo "seedance-full endpoint hardening installed"
echo "backup: $BACKUP_ROOT"
