#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="admin-openai-chat-image-option-20260606024009"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/admin-web" || fail "admin-web not found: $APP_DIR/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

ADMIN_SRC="$SRC_ROOT/ai-admin-platform/admin-web/src/main.tsx"
ADMIN_DIST="$SRC_ROOT/ai-admin-platform/admin-web/dist"
[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"

log "verify package markers"
grep -Fq "openai-chat-image" "$ADMIN_SRC"
grep -Fq "OpenAI Chat 生图 /v1/chat/completions" "$ADMIN_SRC"
grep -Rqs "openai-chat-image" "$ADMIN_DIST/assets"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/admin-web/src" "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install admin-web files"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist"
run_sudo install -m 0644 "$ADMIN_SRC" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist"
run_sudo mkdir -p "$APP_DIR/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"

log "verify installed markers"
run_sudo grep -Fq "openai-chat-image" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Fq "OpenAI Chat 生图 /v1/chat/completions" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Rqs "openai-chat-image" "$APP_DIR/admin-web/dist/assets"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
