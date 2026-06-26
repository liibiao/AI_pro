#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-unified-preview-progress-mask-20260604151706"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-/home/ubuntu/漫剧创作库}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_ROOT="${MIRROR_TARGET}/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "this deploy writes public workbench files; please run it with sudo" >&2
  exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

PUBLIC_SRC="$TMP_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
MIRROR_SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$PUBLIC_SRC" ]; then
  echo "package file missing: $PUBLIC_SRC" >&2
  exit 1
fi

install_canvas_file(){
  local src="$1"
  local dest="$2"
  local label="$3"
  local dest_dir
  dest_dir="$(dirname "$dest")"
  if [ ! -d "$dest_dir" ]; then
    echo "$label directory not found: $dest_dir" >&2
    return 1
  fi
  if [ ! -f "$dest" ]; then
    echo "$label file not found: $dest" >&2
    return 1
  fi
  local backup_dir="$BACKUP_ROOT/$label"
  mkdir -p "$backup_dir"
  cp -p "$dest" "$backup_dir/image-studio-canvas-next.html"
  local owner mode
  owner="$(stat -c '%u:%g' "$dest")"
  mode="$(stat -c '%a' "$dest")"
  install -m "$mode" "$src" "$dest"
  chown "$owner" "$dest"
  echo "$dest"
}

verify_markers(){
  local dest="$1"
  grep -Fq -- "20260604-unified-preview-progress-mask" "$dest"
  grep -Fq -- "function generationProgressLabel(n)" "$dest"
  grep -Fq -- "if(n.type==='imageToPanorama')return '全景生成中';" "$dest"
  grep -Fq -- "if(n.type==='seedanceVideo')return '生视频中';" "$dest"
  grep -Fq -- "if(n.type==='assetDesign')return '资产设计中';" "$dest"
  grep -Fq -- "if(n.type==='img2imgAll')return '图生图中';" "$dest"
  grep -Fq -- "if(n.type==='singleImage')return ({stylize:'风格化中'" "$dest"
  grep -Fq -- ".node.running .preview-card>.gen-progress-mask:not([data-pano-upload-mask])" "$dest"
  grep -Fq -- ".node.running .aio-preview>.gen-progress-mask:not([data-pano-upload-mask])" "$dest"
  grep -Fq -- ".node.running .vn2-preview>.gen-progress-mask:not([data-pano-upload-mask])" "$dest"
  grep -Fq -- ".node.node-type-storyboardImage .storygrid-panel>.storygrid-shot-progress::before" "$dest"
  grep -Fq -- ".node.node-type-textPrompt .aio-preview>.asset-card-derive-progress::before" "$dest"
  grep -Fq -- "width:var(--unified-progress)!important;" "$dest"
  grep -Fq -- "backdrop-filter:blur(18px) saturate(1.14)!important;" "$dest"
  grep -Fq -- "if(text){const lbl=generationProgressLabel(n);updateUnifiedProgressText(text,progress,lbl);}" "$dest"
  grep -Fq -- "function assetDesignExecutableRefs(n,uploadMode=getExecutionReferenceUploadMode(n))" "$dest"
  grep -Fq -- "const taskInputFiles=mode==='txt2img'?[]:builtInputFiles;" "$dest"
  grep -Fq -- "const previewInputFiles=(built.payload?.mode==='txt2img')?[]:buildUnifiedInputFiles" "$dest"
  if grep -Fq -- "add(assetDesignTemplateReferenceEntry(n));" "$dest"; then
    echo "unexpected runtime template reference injection remains" >&2
    exit 1
  fi
}

UPDATED=()

log "install public workbench canvas: $WORKBENCH_DIR"
PUBLIC_DEST="$WORKBENCH_DIR/image-studio-canvas-next.html"
install_canvas_file "$PUBLIC_SRC" "$PUBLIC_DEST" "public-workbench"
verify_markers "$PUBLIC_DEST"
UPDATED+=("$PUBLIC_DEST")

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror canvas: $MIRROR_TARGET/tools/workbench-web"
  MIRROR_DEST="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
  install_canvas_file "$MIRROR_SRC" "$MIRROR_DEST" "mirror-workbench"
  verify_markers "$MIRROR_DEST"
  UPDATED+=("$MIRROR_DEST")
else
  log "mirror target not found, skipped: $MIRROR_TARGET/tools/workbench-web"
fi

log "done"
echo "updated:"
printf ' - %s\n' "${UPDATED[@]}"
echo "backup: $BACKUP_ROOT"
echo "Hard-refresh the canvas page after deploy."
