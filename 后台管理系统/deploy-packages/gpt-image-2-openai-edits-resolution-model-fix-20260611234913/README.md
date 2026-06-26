# GPT-Image-2 OpenAI Edits Resolution Model Fix

Fixes the real `https://api.aiid.edu.kg/v1` GPT-Image-2 channel, whose provider/model adapter is `openai-edits`.

The OpenAI image request builder now expands `gpt-image-2` by the requested resolution before sending upstream:

- `1K` -> `gpt-image-2-1k`
- `2K` -> `gpt-image-2-2k`
- `4K` -> `gpt-image-2-4k`
- `3840x2160` -> `gpt-image-2-4k`

Changed files:

- `ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts`
- `ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js`
