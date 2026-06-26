GPT-Image-V2 API server resolution model fix
===========================================

Fixes the Node generation adapter on the admin server so `gpt-image-v2`
does not append a resolution suffix for 1K or 3K image requests.

Expected model routing:

- 1K -> `gpt-image-2`
- 2K -> `gpt-image-2-2k`
- 3K -> `gpt-image-2`
- 4K -> `gpt-image-2-4k`

