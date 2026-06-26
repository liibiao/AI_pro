#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/fullblood-video-protocol-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/fullblood-video-protocol-fix-$(date +%Y%m%d%H%M%S)"

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
  const providerId = 'canvas-provider-fullblood-video';
  await prisma.upstreamProvider.update({
    where: { id: providerId },
    data: {
      status: 'ACTIVE',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
    },
  });
  const models = await prisma.aiModel.findMany({
    where: { providerId, type: 'VIDEO', adapter: 'fullblood-video' },
  });
  for (const model of models) {
    const protocol = model.protocol && typeof model.protocol === 'object' && !Array.isArray(model.protocol)
      ? { ...model.protocol }
      : {};
    await prisma.aiModel.update({
      where: { id: model.id },
      data: {
        endpointPath: '/videos',
        statusEndpointPath: '/videos/{taskId}',
        protocol: {
          ...protocol,
          adapter: 'fullblood-video',
          endpointPath: '/videos',
          endpoint_path: '/videos',
          statusEndpointPath: '/videos/{taskId}',
          status_endpoint_path: '/videos/{taskId}',
        },
      },
    });
  }
  console.log(`[fullblood-video-protocol] patched ${models.length} fullblood-video models to /videos`);
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

echo "fullblood-video protocol fix installed"
echo "backup: $BACKUP_ROOT"
