#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sd2-official-generate-audio-fix-20260612044648"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
API_DIR="${API_DIR:-$APP_DIR/api-server}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if [ "$(id -u)" -eq 0 ] && id "$PM2_USER" >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_DIR" || fail "api-server not found: $API_DIR"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  [ -f "$SRC_ROOT/$rel" ] || fail "$rel missing in package"
  printf '%s\n' "$SRC_ROOT/$rel"
}
backup_file(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$2"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo install -m 0644 "$src" "$dest"
  log "installed $dest"
}

log "verify package markers"
grep -Fq "resolveOfficialSd2GenerateAudio" "$SRC_ROOT/api-server/src/modules/generation/adapters/registry.ts"
grep -Fq "generate_audio: generateAudio" "$SRC_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizeOfficialSd2SoundCapability" "$SRC_ROOT/api-server/src/modules/models/routes.ts"
grep -Fq "soundControlField: 'generate_audio'" "$SRC_ROOT/api-server/dist/modules/models/routes.js"
grep -Fq "targetIds = ['canvas-sd2', 'canvas-sd2-fast', 'canvas-sd2-full']" "$SRC_ROOT/deploy/fix-sd2-sound-field.mjs"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api files"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$API_DIR/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$API_DIR/dist/modules/generation/adapters/registry.js"
install_file "api-server/src/modules/models/routes.ts" "$API_DIR/src/modules/models/routes.ts"
install_file "api-server/dist/modules/models/routes.js" "$API_DIR/dist/modules/models/routes.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$API_DIR' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "normalize existing SD2 model capabilities"
run_sudo bash -lc "cd '$API_DIR' && node '$SRC_ROOT/deploy/fix-sd2-sound-field.mjs'"

log "restart pm2 app: $PM2_APP"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 app not found, skipped: $PM2_APP"
fi

log "verify installed markers"
run_sudo grep -Fq "resolveOfficialSd2GenerateAudio" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "generate_audio: generateAudio" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "normalizeOfficialSd2SoundCapability" "$API_DIR/dist/modules/models/routes.js"
run_sudo grep -Fq "soundControlField: 'generate_audio'" "$API_DIR/dist/modules/models/routes.js"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "SD2 official generate_audio fix deployed"
