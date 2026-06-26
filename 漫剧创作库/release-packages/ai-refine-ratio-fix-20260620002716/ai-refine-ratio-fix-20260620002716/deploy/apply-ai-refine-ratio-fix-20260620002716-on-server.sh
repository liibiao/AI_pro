#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="ai-refine-ratio-fix-20260620002716"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$WEB_ROOT/workbench-web" || fail "workbench root not found: $WEB_ROOT/workbench-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

HTML="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$HTML" ] || fail "package missing image-studio-canvas-next.html"

log "verify package markers"
grep -Fq "function refineRatioFromLegacySize" "$HTML"
grep -Fq "const explicitRatio=refineRatioFromLegacySize" "$HTML"
grep -Fq "src.values.refineSize=sizeEl.value" "$HTML"
grep -Fq "n.values.refineSize=inp.value;n.values.refineResolution=refineResolutionFromLegacySize(inp.value)" "$HTML"

install_file(){
  local dest="$1"
  run_sudo mkdir -p "$BACKUP_DIR/${dest#/}" "$(dirname "$dest")"
  if [ -f "$dest" ]; then run_sudo cp -a "$dest" "$BACKUP_DIR/${dest#/}.bak"; fi
  run_sudo install -m 0644 "$HTML" "$dest"
  log "installed $dest"
}

log "backup current files: $BACKUP_DIR"
install_file "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  install_file "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "verify installed markers"
run_sudo grep -Fq "function refineRatioFromLegacySize" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "const explicitRatio=refineRatioFromLegacySize" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "src.values.refineSize=sizeEl.value" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"

curl -fsS http://127.0.0.1/image-studio-canvas-next.html >/dev/null 2>&1 && log "web health: ok" || log "web health: skipped/failed"
log "done"
echo "backup: $BACKUP_DIR"
