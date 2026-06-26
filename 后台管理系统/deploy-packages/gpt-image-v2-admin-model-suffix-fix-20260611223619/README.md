# GPT-Image-v2 Admin Model Suffix Fix

Fixes the backend generation adapter for `gpt-image-v2` channels so a configured base model such as `gpt-image-2` is expanded by the requested image resolution before calling the upstream API.

Examples:

- `resolution: "2K"` -> `model: "gpt-image-2-2k"`
- `resolution: "4K"` -> `model: "gpt-image-2-4k"`
- `resolution: "3840x2160"` -> `model: "gpt-image-2-4k"`

Changed files:

- `ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts`
- `ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js`
