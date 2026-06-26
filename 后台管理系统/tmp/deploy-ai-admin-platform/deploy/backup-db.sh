#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ai-admin}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/ai-admin-$(date +%Y%m%d-%H%M%S).sql.gz"

pg_dump "$DATABASE_URL" | gzip > "$FILE"
find "$BACKUP_DIR" -name 'ai-admin-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup written to $FILE"
