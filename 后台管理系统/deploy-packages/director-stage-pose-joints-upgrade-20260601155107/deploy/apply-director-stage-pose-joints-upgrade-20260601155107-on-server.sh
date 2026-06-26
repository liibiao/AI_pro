#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/director-stage-pose-joints-upgrade-20260601155107.tar.gz}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/director-stage-pose-joints-upgrade-20260601155107-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/director-stage-pose-joints-upgrade-20260601155107-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/director-stage-pose-joints-upgrade-20260601155107"
HTML="$SRC/workbench-web/image-studio-canvas-next.html"

test -f "$HTML" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }

log "verify package markers"
grep -q "name:'3D导演台'" "$HTML"
grep -q "function directorActorPosePoints" "$HTML"
grep -q "function directorStageSelectJoint" "$HTML"
grep -q "actorJoint" "$HTML"
grep -q "data-director-joint-select" "$HTML"
grep -q "DIRECTOR_STAGE_JOINTS" "$HTML"
grep -q "directorStageTransformMode" "$HTML"

log "backup: $BACKUP"
run_sudo mkdir -p "$BACKUP/workbench-web"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas html"
run_sudo cp -f "$HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi

run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "verify installed markers"
run_sudo grep -q "name:'3D导演台'" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function directorActorPosePoints" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "function directorStageSelectJoint" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "actorJoint" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "data-director-joint-select" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "DIRECTOR_STAGE_JOINTS" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "directorStageTransformMode" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "reload services if available"
run_sudo systemctl restart ai-admin 2>/dev/null || true
run_sudo systemctl reload nginx 2>/dev/null || true

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
