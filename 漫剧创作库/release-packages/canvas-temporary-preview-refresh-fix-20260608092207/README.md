# canvas-temporary-preview-refresh-fix-20260608092207

Fixes refresh-time preview recovery while 124 async COS materialization is still pending.

- Canvas persists backend `temporaryUrl` / `temporaryUrls` from generation tasks into image entries.
- Canvas preview recovery uses temporary URLs before COS is available.
- Workflow compaction treats temporary URLs as recoverable media references, so inline data can be dropped safely without losing preview.
- Includes the existing backend GPT/base64 async-COS adapter fix.
