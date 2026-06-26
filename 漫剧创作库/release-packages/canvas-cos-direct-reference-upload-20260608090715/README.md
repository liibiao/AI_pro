# canvas-cos-direct-reference-upload-20260608090715

Fixes reference-media uploads in `image-studio-canvas-next.html` for object storage mode.

- Browser reference uploads now request `/api/workbench/image-studio/object-storage-upload-target` and PUT directly to COS/S3/OSS/R2.
- Object storage mode no longer falls back to backend upload forwarding after direct upload failure.
- Reference image/video/audio MIME types are allowed by the object storage uploader.
- Workbench server exposes the presigned upload target route used by the browser.

Deploy with:

```bash
/Users/billy/.codex/skills/canvas-package-deploy/scripts/deploy_canvas_package.sh --target 124 --archive /Users/billy/Documents/AI_pro/漫剧创作库/release-packages/canvas-cos-direct-reference-upload-20260608090715.tar.gz --script /Users/billy/Documents/AI_pro/漫剧创作库/release-packages/canvas-cos-direct-reference-upload-20260608090715/deploy/apply-canvas-cos-direct-reference-upload-20260608090715-on-server.sh
```
