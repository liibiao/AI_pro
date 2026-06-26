# canvas-base64-refresh-persist-hardening-20260608000612

Hardens base64 image persistence after generation and canvas-derived operations.

Changes:
- Save workflow immediately after image/storyboard media results are written.
- Localize front-end canvas base64 outputs for storyboard crop/composite and blank paint canvas.
- Fail visibly if a generation result only returns base64 and local preview persistence fails.

Installed files:
- workbench-web/image-studio-canvas-next.html
- tools/workbench-web/image-studio-canvas-next.html
- tools/workbench_server.py
- smart-vision/services/workbench/workbench_server.py

