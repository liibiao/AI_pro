#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/seedance-full-resolution-ui-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/seedance-full-resolution-ui-fix-$(date +%Y%m%d%H%M%S)"

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

install_file "tools/workbench-web/image-studio-canvas-next.html"
install_file "workbench-web/image-studio-canvas-next.html"

cd "$APP_ROOT/api-server"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const providerId = 'canvas-provider-seedance-full';
  const modelId = 'canvas-sz-seedance2';
  const model = await prisma.aiModel.findUnique({ where: { id: modelId } });
  if (model) {
    const capabilities = model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities) ? { ...model.capabilities } : {};
    const protocol = model.protocol && typeof model.protocol === 'object' && !Array.isArray(model.protocol) ? { ...model.protocol } : {};
    await prisma.$transaction([
      prisma.upstreamProvider.update({ where: { id: providerId }, data: { status: 'ACTIVE' } }),
      prisma.aiModel.update({
        where: { id: modelId },
        data: {
          status: 'ACTIVE',
          capabilities: { ...capabilities, resolutions: ['720p', '1080p'], defaultResolution: capabilities.defaultResolution || '720p' },
          protocol: {
            ...protocol,
            adapter: 'seedance-full',
            modelByResolution: {
              ...(protocol.modelByResolution && typeof protocol.modelByResolution === 'object' ? protocol.modelByResolution : {}),
              '720p': 'sz-seedance2',
              '1080p': 'sz-seedance2-1080p',
            },
          },
        },
      }),
    ]);
    console.log('[seedance-full-ui] confirmed ACTIVE with 720p+1080p');
  } else {
    console.log(`[seedance-full-ui] model ${modelId} not found, skipped db check`);
  }
} finally {
  await prisma.$disconnect();
}
NODE

echo "seedance-full resolution ui fix installed"
echo "backup: $BACKUP_ROOT"
