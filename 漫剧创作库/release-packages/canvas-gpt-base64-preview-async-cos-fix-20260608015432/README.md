# canvas-gpt-base64-preview-async-cos-fix-20260608015432

Fixes GPT `server_base64_async_object_storage` image output behavior.

- Backend now returns `data:image/...;base64,...` immediately for provider `b64_json` results.
- Existing async server object-storage materialization uploads that data URL to COS and replaces task result URLs after success.
- Canvas display paths still absolutize `/api/generation/results/...` as a fallback for old/in-flight records.
