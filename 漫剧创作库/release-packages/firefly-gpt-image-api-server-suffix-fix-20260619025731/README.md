Firefly GPT-Image API server suffix fix
======================================

Fixes the Node generation adapter on the admin server so Firefly GPT-Image
model names are treated as complete geometry model names, even when a
database record still routes them through the `gpt-image-v2` adapter.

Expected routing:

- `firefly-gpt-image-1k-3x2` -> `firefly-gpt-image-1k-3x2`
- `firefly-gpt-image-1k-3x2-1k` -> `firefly-gpt-image-1k-3x2`
- `firefly-gpt-image-2k-16x9` -> `firefly-gpt-image-2k-16x9`
- `gpt-image-2` with 1K/3K -> `gpt-image-2`
- `gpt-image-2` with 2K/4K -> `gpt-image-2-2k` / `gpt-image-2-4k`

