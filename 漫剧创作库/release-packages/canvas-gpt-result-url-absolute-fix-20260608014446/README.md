# canvas-gpt-result-url-absolute-fix-20260608014446

Fixes GPT `server_base64_async_object_storage` temporary generation previews when the backend returns relative result URLs such as `/api/generation/results/...`.

- Adds a dedicated platform API URL absolutizer based on `CanvasAccountGate.state.apiBase`.
- Sends absolute `remoteUrl` values to the backend local-preview endpoint.
- Keeps generated entries on durable local previews after refresh.
