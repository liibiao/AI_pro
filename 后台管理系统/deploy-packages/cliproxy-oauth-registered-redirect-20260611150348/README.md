# cliproxy-oauth-registered-redirect-20260611150348

Restores built-in OAuth authorization requests to provider-registered loopback redirect URIs so OpenAI/Codex, xAI, Antigravity, Gemini, and Claude do not fail at the provider authorization screen with invalid redirect/request errors.

The server still exposes public callback aliases for manually forwarded callbacks:
- `/auth/callback` for Codex/OpenAI
- `/oauth2callback` for Gemini
- `/oauth-callback` for Antigravity
- `/callback` for Claude/xAI, inferred by OAuth state
- provider-specific aliases: `/anthropic/callback`, `/codex/callback`, `/google/callback`, `/antigravity/callback`, `/xai/callback`
