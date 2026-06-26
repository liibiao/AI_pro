#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMART_VISION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_ROOT="$SMART_VISION_DIR/.runtime/legacy-workbench-root"
PROJECT_ROOT="$RUN_ROOT/smart-vision-workspace"

mkdir -p "$PROJECT_ROOT/tools" "$PROJECT_ROOT/wordlists" "$PROJECT_ROOT/data/files" "$PROJECT_ROOT/runninghub_outputs"

rm -rf "$PROJECT_ROOT/tools/workbench-web"
cp -R "$SMART_VISION_DIR/canvas/legacy-workbench/workbench-web" "$PROJECT_ROOT/tools/workbench-web"
cp "$SMART_VISION_DIR/config/model-registry.json" "$PROJECT_ROOT/tools/workbench-web/model-registry.json"
cp "$SMART_VISION_DIR/services/workbench/workbench_server.py" "$PROJECT_ROOT/tools/workbench_server.py"
cp "$SMART_VISION_DIR/services/workbench/workbench_core.py" "$PROJECT_ROOT/tools/workbench_core.py"
cp "$SMART_VISION_DIR/services/workbench/image_studio_backend.py" "$PROJECT_ROOT/tools/image_studio_backend.py"
cp "$SMART_VISION_DIR/services/workbench/init_outputs.py" "$PROJECT_ROOT/tools/init_outputs.py"
cp "$SMART_VISION_DIR/services/workbench/object_storage_uploader.py" "$PROJECT_ROOT/tools/object_storage_uploader.py"
cp "$SMART_VISION_DIR/services/workbench/workbench_cli.py" "$PROJECT_ROOT/tools/workbench_cli.py"

rm -rf "$PROJECT_ROOT/wordlists/mj-image" "$PROJECT_ROOT/wordlists/style"
mkdir -p "$PROJECT_ROOT/wordlists"
cp -R "$SMART_VISION_DIR/config/wordlists/mj-image" "$PROJECT_ROOT/wordlists/mj-image"
cp -R "$SMART_VISION_DIR/config/wordlists/style" "$PROJECT_ROOT/wordlists/style"

export SMART_VISION_ROOT="$SMART_VISION_DIR"
export SMART_VISION_OUTPUTS_DIR="$SMART_VISION_DIR/outputs"

cd "$PROJECT_ROOT"
exec python3 tools/workbench_server.py --host "${HOST:-127.0.0.1}" --port "${PORT:-8877}"
