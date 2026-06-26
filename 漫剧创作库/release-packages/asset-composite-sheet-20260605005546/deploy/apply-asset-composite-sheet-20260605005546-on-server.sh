#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="asset-composite-sheet-20260605005546"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_ROOT="${MIRROR_TARGET}/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }
fail(){ echo "[deploy] ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  fail "this deploy writes public workbench files; please run it with sudo"
fi
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

PUBLIC_HTML_SRC="$TMP_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
PUBLIC_CSS_SRC="$TMP_DIR/$PKG/workbench-web/canvas-next/tapnow-rewrite.css"
MIRROR_HTML_SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
MIRROR_CSS_SRC="$TMP_DIR/$PKG/tools/workbench-web/canvas-next/tapnow-rewrite.css"

[ -f "$PUBLIC_HTML_SRC" ] || fail "package file missing: $PUBLIC_HTML_SRC"
[ -f "$PUBLIC_CSS_SRC" ] || fail "package file missing: $PUBLIC_CSS_SRC"

install_file(){
  local src="$1"
  local dest="$2"
  local label="$3"
  local name owner mode backup_dir
  name="$(basename "$dest")"
  [ -f "$src" ] || fail "missing source for $label: $src"
  [ -d "$(dirname "$dest")" ] || fail "$label directory not found: $(dirname "$dest")"
  [ -f "$dest" ] || fail "$label file not found: $dest"
  backup_dir="$BACKUP_ROOT/$label"
  mkdir -p "$backup_dir"
  cp -p "$dest" "$backup_dir/$name"
  owner="$(stat -c '%u:%g' "$dest")"
  mode="$(stat -c '%a' "$dest")"
  install -m "$mode" "$src" "$dest"
  chown "$owner" "$dest"
  echo "$dest"
}

verify_html(){
  local dest="$1"
  grep -Fq "assetCompositeTemplateDefinition" "$dest"
  grep -Fq "合成资产图 · 白底三视图总览" "$dest"
  grep -Fq "data-asset-card-composite-enabled" "$dest"
  grep -Fq "createAssetCompositeImageNode" "$dest"
  grep -Fq "compositeNodeId" "$dest"
  grep -Fq "20260605-asset-composite-sheet" "$dest"
}

verify_css(){
  local dest="$1"
  grep -Fq ".asset-card-composite-option" "$dest"
  grep -Fq ".asset-card-composite-toolbar" "$dest"
  grep -Fq ".asset-card-composite-check input:checked+span" "$dest"
}

UPDATED=()

log "install public workbench files: $WORKBENCH_DIR"
PUBLIC_HTML_DEST="$WORKBENCH_DIR/image-studio-canvas-next.html"
PUBLIC_CSS_DEST="$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"
install_file "$PUBLIC_HTML_SRC" "$PUBLIC_HTML_DEST" "public-workbench"
install_file "$PUBLIC_CSS_SRC" "$PUBLIC_CSS_DEST" "public-workbench-css"
verify_html "$PUBLIC_HTML_DEST"
verify_css "$PUBLIC_CSS_DEST"
UPDATED+=("$PUBLIC_HTML_DEST" "$PUBLIC_CSS_DEST")

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench files: $MIRROR_TARGET/tools/workbench-web"
  MIRROR_HTML_DEST="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
  MIRROR_CSS_DEST="$MIRROR_TARGET/tools/workbench-web/canvas-next/tapnow-rewrite.css"
  install_file "$MIRROR_HTML_SRC" "$MIRROR_HTML_DEST" "mirror-workbench"
  install_file "$MIRROR_CSS_SRC" "$MIRROR_CSS_DEST" "mirror-workbench-css"
  verify_html "$MIRROR_HTML_DEST"
  verify_css "$MIRROR_CSS_DEST"
  UPDATED+=("$MIRROR_HTML_DEST" "$MIRROR_CSS_DEST")
else
  log "mirror target not found, skipped: $MIRROR_TARGET/tools/workbench-web"
fi

log "done"
echo "updated:"
printf ' - %s\n' "${UPDATED[@]}"
echo "backup: $BACKUP_ROOT"
echo "Hard-refresh the canvas page after deploy."
