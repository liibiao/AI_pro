# GPT-Image-V2 Resolution Model Fix

Fixes GPT-Image-V2 canvas generation so selected 2K/3K/4K resolution tiers are reflected in the upstream `model` field, for example `gpt-image-2-2k` and `gpt-image-2-4k`.

Included:
- `workbench-web/image-studio-canvas-next.html`
- `workbench-web/canvas-next/generation-service.js`
- `tools/workbench-web/image-studio-canvas-next.html`
- `tools/workbench-web/canvas-next/generation-service.js`
- `tools/image_studio_backend.py`
- `smart-vision/services/workbench/image_studio_backend.py`
- `smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html`
- `smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js`

Deploy:

```bash
bash deploy/apply-gpt-image-v2-resolution-model-fix-20260611214909-on-server.sh /tmp/gpt-image-v2-resolution-model-fix-20260611214909.tar.gz
```
