# canvas-base64-preview-nonfatal-fix-20260608024929

Fixes generated-image inline base64 preview handling.

- Canvas no longer fails generation when local preview persistence fails for a base64 result.
- Inline base64 is kept visible while server-side COS materialization continues.
- Existing `/api/generation/results/...` preview URLs still get API baseURL fallback.
- Includes backend GPT base64 async-COS behavior from the previous fix.
