# cliproxy-grok-media-backport-20260605224714

Backports xAI/Grok media support into the rolled-back CLIProxyAPI v6 build without applying the full upstream latest update.

Included routes:

- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/videos`
- `POST /v1/videos/generations`
- `POST /v1/videos/edits`
- `POST /v1/videos/extensions`
- `GET /v1/videos/{request_id}`

Included models:

- `grok-imagine-image`
- `grok-imagine-image-quality`
- `grok-imagine-video`
- `grok-imagine-video-1.5-preview`

Deploy target command shape:

```bash
/Users/billy/.codex/skills/canvas-package-deploy/scripts/deploy_canvas_package.sh \
  --target 45 \
  --archive /tmp/cliproxy-grok-media-backport-20260605224714.tar.gz \
  --script "/Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/cliproxy-grok-media-backport-20260605224714/deploy/apply-cliproxy-grok-media-backport-20260605224714-on-server.sh"
```
