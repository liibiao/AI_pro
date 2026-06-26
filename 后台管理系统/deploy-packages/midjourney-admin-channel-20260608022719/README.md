# midjourney-admin-channel-20260608022719

Admin/API package for Midjourney Imagine image generation channel.

Installs:

- API adapter and model route source/dist
- `sync-canvas-models` source/dist Midjourney defaults
- `materialize-midjourney-imagine.mjs` DB upsert script
- admin-web source/dist with Midjourney adapter option

DB rows:

- Provider: `midjourney_imagine`
- Model: `canvas-midjourney-imagine`

Default upstream:

- Base URL: `http://45.77.211.38:8317` unless `MIDJOURNEY_BASE_URL` is set
- Submit: `/mj/submit/imagine`
- Status: `/mj/task/{taskId}/fetch`
- Upload mode: `object_storage`

