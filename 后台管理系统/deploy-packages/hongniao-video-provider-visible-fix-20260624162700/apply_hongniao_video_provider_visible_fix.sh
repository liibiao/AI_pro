#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/hongniao-video-provider-visible-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/hongniao-video-provider-visible-fix-$(date +%Y%m%d%H%M%S)"

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
  const providerId = 'canvas-provider-fullblood-video';
  const provider = await prisma.upstreamProvider.findUnique({
    where: { id: providerId },
    select: { id: true, status: true, name: true, baseUrl: true },
  });
  if (!provider) {
    console.log(`[hongniao-visible] provider ${providerId} not found, skip db patch`);
  } else {
    await prisma.upstreamProvider.update({
      where: { id: providerId },
      data: { status: 'ACTIVE' },
    });
    console.log(`[hongniao-visible] provider ${providerId} ${provider.status} -> ACTIVE`);
  }
} finally {
  await prisma.$disconnect();
}
NODE

echo "hongniao video provider visible fix installed"
echo "backup: $BACKUP_ROOT"
