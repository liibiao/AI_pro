# canvas-gpt-temp-result-localize-fix-20260608013525

Fixes GPT image results that return relative temporary generation URLs under `server_base64_async_object_storage`.

- Converts `/api/generation/results/...` and `/v1/images/results/...` into API-base absolute URLs before localizing previews.
- Saves generated entry previews locally before project persistence.
- Keeps refresh rendering on durable local previews first, while original/remote URLs remain available for full-size usage.
