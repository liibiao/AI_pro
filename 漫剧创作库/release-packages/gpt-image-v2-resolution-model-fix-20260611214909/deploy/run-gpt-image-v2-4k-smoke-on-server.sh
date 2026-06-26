#!/usr/bin/env bash
set +H
set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/漫剧创作库}"
export ROOT

python3 - <<'PY'
from __future__ import annotations

import importlib.util
import json
import os
import sys
from datetime import datetime
from pathlib import Path

root = Path(os.environ.get("ROOT") or "/home/ubuntu/漫剧创作库")
module_path = root / "tools" / "image_studio_backend.py"
if not module_path.exists():
    raise SystemExit(f"image_studio_backend.py not found: {module_path}")

spec = importlib.util.spec_from_file_location("image_studio_backend_smoke", module_path)
module = importlib.util.module_from_spec(spec)
sys.modules["image_studio_backend_smoke"] = module
assert spec.loader is not None
spec.loader.exec_module(module)

model_paths = [
    root / "tools" / "workbench-web" / "models" / "gpt-image-v2.json",
    Path("/var/www/ai-admin/workbench-web/models/gpt-image-v2.json"),
]
model_config = None
model_path = None
for candidate in model_paths:
    if candidate.exists():
        model_config = json.loads(candidate.read_text(encoding="utf-8"))
        model_path = candidate
        break
if not model_config:
    raise SystemExit("gpt-image-v2 model config not found")

api_key = str(model_config.get("apiKey") or model_config.get("key") or "").strip()
if not api_key:
    raise SystemExit(f"gpt-image-v2 api key missing in {model_path}")

payload = {
    "baseUrl": model_config.get("baseUrl") or model_config.get("url") or "https://socdabat.it.com/v1",
    "apiKey": api_key,
    "model": model_config.get("model") or "gpt-image-2",
    "adapter": model_config.get("adapter") or "gpt-image-v2",
    "protocol": model_config.get("protocol") or {"adapter": "gpt-image-v2", "endpointPath": "/images/generations"},
    "endpointPath": model_config.get("endpointPath") or "/images/generations",
    "prompt": "一只猫",
    "aspect_ratio": "16:9",
    "aspectRatio": "16:9",
    "size": "16:9",
    "resolution": "4k",
    "requestedResolution": "4k",
    "reasoning_effort": model_config.get("defaults", {}).get("reasoning_effort") or "medium",
}

config, request_payload = module.build_image_payload(payload, images=[])
print(json.dumps({
    "preflightModel": request_payload.get("model"),
    "preflightResolution": request_payload.get("resolution"),
    "preflightAspectRatio": request_payload.get("aspect_ratio"),
}, ensure_ascii=False), flush=True)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
output_dir = root / "runninghub_outputs" / "image-studio-v3" / f"gpt-image-v2-4k-smoke-{stamp}"
result = module.generate_from_text(payload, output_dir)
saved = result.get("saved") or {}
print(json.dumps({
    "model": result.get("model"),
    "requestedResolution": result.get("requestedResolution") or saved.get("requestedResolution"),
    "actualSize": result.get("actualSize") or saved.get("actualSize"),
    "width": saved.get("width"),
    "height": saved.get("height"),
    "path": saved.get("path"),
    "url": saved.get("url") or saved.get("remoteUrl") or saved.get("localUrl"),
}, ensure_ascii=False), flush=True)
PY
