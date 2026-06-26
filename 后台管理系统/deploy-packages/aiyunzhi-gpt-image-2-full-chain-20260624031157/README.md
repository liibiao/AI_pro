# Aiyunzhi GPT Image 2 Full Chain Package

Package: `aiyunzhi-gpt-image-2-full-chain-20260624031157`

What it installs:

- Backend generation adapter `aiyunzhi-gpt-image-2`
- Admin model-management adapter option
- Canvas model config and registry for `gpt-image-2`
- Idempotent DB apply script preserving existing API key and pricing
- Built backend `dist` files and admin-web `dist`

Verified locally:

- Backend `tsc -p tsconfig.json`
- Admin `vite build`
- JS syntax checks for canvas modules
- Python compile checks for workbench helpers
- Request preview:
  - Text-to-image: `POST https://aiyunzhi.top/v1/images/generations`, JSON, `model=gpt-image-2`, `size=4k`
  - Reference-image generation: `POST https://aiyunzhi.top/v1/images/edits`, multipart, `image`/`image[]`, `model=gpt-image-2`

Deploy on server:

```bash
bash /tmp/apply-aiyunzhi-gpt-image-2-full-chain-on-server.sh /tmp/aiyunzhi-gpt-image-2-full-chain-20260624031157.tar.gz
```

Notes:

- The script does not run full canvas model sync.
- Existing non-placeholder API keys are preserved.
- Existing pricing is preserved for existing DB rows; new rows use `1K/2K/4K` only.
